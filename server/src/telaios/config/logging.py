"""Structured logging configuration (structlog).

- Development: human-readable console renderer with colors and timestamps.
- Production:  JSON renderer for ingestion by log aggregators.

Usage::

    from telaios.config.logging import configure_logging, get_logger

    configure_logging()  # call once at startup (main.py)
    logger = get_logger(__name__)
    logger.info("server.started", port=8000)
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import Processor

from telaios.config.settings import settings


def _build_shared_processors() -> list[Processor]:
    """Processors applied to *every* log entry, regardless of renderer."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]


def configure_logging(*, force: bool = False) -> None:
    """Configure structlog and the stdlib logging bridge.

    Idempotent: subsequent calls are no-ops unless ``force=True``.
    """
    if structlog.is_configured() and not force:
        return

    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
    is_dev = settings.is_development

    shared: list[Processor] = _build_shared_processors()

    renderer: Processor = (
        structlog.dev.ConsoleRenderer(colors=True)
        if is_dev
        else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Bridge stdlib logging (uvicorn, sqlalchemy, etc.) through structlog.
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Quiet noisy libraries unless we're at DEBUG level.
    if log_level > logging.DEBUG:
        for noisy in ("uvicorn.access", "watchfiles", "asyncio"):
            logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str | None = None, **initial: Any) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger, optionally pre-bound with kwargs."""
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    if initial:
        logger = logger.bind(**initial)
    return logger
