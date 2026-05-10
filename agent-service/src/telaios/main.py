"""
cli/main.py
-----------
FastAPI application entrypoint.

Imports only from ``domain/``, ``tools/``, ``infra/``, and ``api/``.

Usage::

    agent-service
    uvicorn cli.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging

import uvicorn

from telaios.client.redis import client as redis_client
from telaios.config.settings import config

# init logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

def run() -> None:

    # check redis connection
    redis_client.check_connection()

    uvicorn.run(
        "telaios.api:create_app",
        host="0.0.0.0",
        port=config.PORT,
        reload=False,
    )

if __name__ == "__main__":
    run()
