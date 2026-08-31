"""
Authentication and OAuth Router for Athena with MongoDB persistence.
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from jose import jwt

from athena.db.mongo import mongo_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "athena-research-agent-jwt-super-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8"))
    except Exception:
        return False


class SignUpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OAuthRequest(BaseModel):
    provider: str  # "google" | "github"
    token: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: Optional[str] = None
    name: str
    email: str
    avatar_url: Optional[str] = None
    auth_provider: str = "local"
    created_at: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignUpRequest) -> AuthResponse:
    existing = mongo_manager.find_user_by_email(body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    hashed_pw = hash_password(body.password)
    user_data = {
        "name": body.name,
        "email": body.email,
        "password_hash": hashed_pw,
        "auth_provider": "local",
        "avatar_url": f"https://api.dicebear.com/7.x/bottts/svg?seed={body.name}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = mongo_manager.upsert_user(user_data)
    token = create_access_token({"sub": body.email, "name": body.name})

    return AuthResponse(
        access_token=token,
        user=UserProfileResponse(
            id=saved.get("id"),
            name=saved["name"],
            email=saved["email"],
            avatar_url=saved.get("avatar_url"),
            auth_provider=saved.get("auth_provider", "local"),
            created_at=saved.get("created_at"),
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest) -> AuthResponse:
    user = mongo_manager.find_user_by_email(body.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if "password_hash" in user:
        if not verify_password(body.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

    token = create_access_token({"sub": user["email"], "name": user.get("name", "User")})

    return AuthResponse(
        access_token=token,
        user=UserProfileResponse(
            id=user.get("id"),
            name=user.get("name", user["email"].split("@")[0]),
            email=user["email"],
            avatar_url=user.get("avatar_url"),
            auth_provider=user.get("auth_provider", "local"),
            created_at=user.get("created_at"),
        ),
    )


@router.post("/oauth", response_model=AuthResponse)
async def oauth_auth(body: OAuthRequest) -> AuthResponse:
    """Handles OAuth registration/login from Google or GitHub."""
    provider = body.provider.lower()
    email = body.email or f"{secrets.token_hex(4)}@{provider}.user"
    name = body.name or ("GitHub Developer" if provider == "github" else "Google User")
    avatar = body.avatar_url or f"https://api.dicebear.com/7.x/bottts/svg?seed={name}"

    user_data = {
        "name": name,
        "email": email,
        "auth_provider": provider,
        "avatar_url": avatar,
        "last_login": datetime.now(timezone.utc).isoformat(),
    }

    saved = mongo_manager.upsert_user(user_data)
    token = create_access_token({"sub": email, "name": name, "provider": provider})

    return AuthResponse(
        access_token=token,
        user=UserProfileResponse(
            id=saved.get("id"),
            name=saved["name"],
            email=saved["email"],
            avatar_url=saved.get("avatar_url"),
            auth_provider=provider,
            created_at=saved.get("created_at"),
        ),
    )


@router.get("/status")
async def db_status() -> dict[str, Any]:
    """Check MongoDB connection and status."""
    return {
        "mongodb_connected": mongo_manager.is_connected,
        "database": os.getenv("MONGODB_DB_NAME", "athena"),
    }
