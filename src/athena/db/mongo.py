"""
MongoDB Database Connector & User/Session Manager for Athena.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

try:
    from pymongo import MongoClient
    from pymongo.collection import Collection
    from pymongo.database import Database
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False

logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/athena")
DB_NAME = os.getenv("MONGODB_DB_NAME", "athena")


class MongoDBManager:
    """Manages connection and operations with MongoDB for Users, Auth, and History."""

    def __init__(self, uri: Optional[str] = None):
        self.uri = uri or os.getenv("MONGODB_URI", DEFAULT_MONGO_URI)
        self.client: Optional[MongoClient] = None
        self.db: Optional[Database] = None
        self.is_connected = False
        self._init_connection()

    def _init_connection(self) -> None:
        if not HAS_PYMONGO:
            logger.warning("PyMongo not installed. MongoDB features disabled.")
            return

        try:
            import certifi
            ca_file = certifi.where()
            self.client = MongoClient(self.uri, tlsCAFile=ca_file, serverSelectionTimeoutMS=3000)
            # Test connection
            self.client.admin.command("ping")
            self.db = self.client.get_database(DB_NAME)
            self.is_connected = True
            self._ensure_indexes()
            logger.info("Connected to MongoDB successfully at database: %s", DB_NAME)
        except Exception as e:
            try:
                # Fallback without tlsCAFile for local MongoDB
                self.client = MongoClient(self.uri, serverSelectionTimeoutMS=2000)
                self.client.admin.command("ping")
                self.db = self.client.get_database(DB_NAME)
                self.is_connected = True
                self._ensure_indexes()
                logger.info("Connected to MongoDB (standard) at database: %s", DB_NAME)
            except Exception as ex2:
                logger.warning("Could not connect to MongoDB (%s). Running in mock/fallback mode.", ex2)
                self.is_connected = False

    def _ensure_indexes(self) -> None:
        if self.db is not None:
            try:
                self.db.users.create_index("email", unique=True)
                self.db.user_sessions.create_index("session_id")
                self.db.query_history.create_index([("user_id", 1), ("created_at", -1)])
            except Exception as e:
                logger.warning("Error creating MongoDB indexes: %s", e)

    def get_users_collection(self) -> Optional[Collection]:
        return self.db.users if self.db is not None and self.is_connected else None

    def get_history_collection(self) -> Optional[Collection]:
        return self.db.query_history if self.db is not None and self.is_connected else None

    def upsert_user(self, user_data: dict[str, Any]) -> dict[str, Any]:
        """Insert or update a user (e.g. from OAuth or local credentials)."""
        coll = self.get_users_collection()
        now = datetime.now(timezone.utc).isoformat()
        
        update_data = {k: v for k, v in user_data.items() if k != "created_at"}
        update_data["updated_at"] = now
        created_at_val = user_data.get("created_at", now)

        if coll is not None:
            res = coll.find_one_and_update(
                {"email": user_data["email"]},
                {
                    "$set": update_data,
                    "$setOnInsert": {"created_at": created_at_val},
                },
                upsert=True,
                return_document=True,
            )
            if res and "_id" in res:
                res["id"] = str(res["_id"])
                del res["_id"]
            return res or user_data
        
        # In-memory mock if Mongo not yet linked
        user_data["created_at"] = user_data.get("created_at", now)
        return user_data

    def find_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        coll = self.get_users_collection()
        if coll is not None:
            doc = coll.find_one({"email": email})
            if doc and "_id" in doc:
                doc["id"] = str(doc["_id"])
                del doc["_id"]
            return doc
        return None


# Global singleton instance
mongo_manager = MongoDBManager()
