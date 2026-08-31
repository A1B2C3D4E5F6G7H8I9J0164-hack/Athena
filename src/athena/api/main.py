"""
FastAPI application — POST /query, GET /health, GET /metrics.

Serves the React frontend in production via static mount.
"""

import logging
import os
from functools import lru_cache
from pathlib import Path

# Limit CPU threads to prevent memory explosion on 512MB RAM hosts (Render free tier)
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from athena.agent.graph import AthenaAgent
from athena.api.database import QueryLogger
from athena.api.routes import router
from athena.api.auth import router as auth_router
from athena.config.settings import AthenaConfig, load_config
from athena.api.utils import get_doc_count

logger = logging.getLogger(__name__)

FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


@lru_cache
def get_config() -> AthenaConfig:
    return load_config()


@lru_cache
def get_agent() -> AthenaAgent:
    return AthenaAgent(get_config())


@lru_cache
def get_logger_db() -> QueryLogger:
    config = get_config()
    return QueryLogger(config.db_path)



def get_doc_count_cached() -> int:
    return get_doc_count(get_config())


def create_app() -> FastAPI:
    config = get_config()

    app = FastAPI(
        title="Athena Research Agent",
        description="Hybrid RAG + web search with cited answers",
        version="0.2.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.api.cors_origins + ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Attach shared deps to app state
    app.state.config = config
    app.state.agent = get_agent()
    app.state.query_logger = get_logger_db()

    app.include_router(router)
    app.include_router(auth_router)

    @app.on_event("startup")
    async def startup() -> None:
        logger.info(
            "Athena API started successfully — Provider: %s",
            config.llm.provider,
        )

    # Serve built React app if available
    if FRONTEND_DIST.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")

    return app


app = create_app()


def run_server() -> None:
    """Entry point for `athena-serve` CLI command."""
    import uvicorn

    config = load_config()
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "athena.api.main:app",
        host=config.api.host,
        port=config.api.port,
        reload=False,
    )


if __name__ == "__main__":
    run_server()
