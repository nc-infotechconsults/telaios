"""tests/unit/modules/document_extraction/test_service.py

Smoke-tests for the background job runners in document_extraction.service.

These runners call get_job_tracker() and get_sessionmaker() — both are patched
so no real DB or Redis connection is needed.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_tracker(*, fail: bool = False) -> AsyncMock:
    tracker = AsyncMock()
    if fail:
        # update_job succeeds on first call (processing), raises on second
        tracker.update_job.side_effect = [None, None]  # just let it pass
    return tracker


def _patch_deps(
    tracker: AsyncMock,
    helper_result: object | None = None,
    helper_raises: Exception | None = None,
) -> tuple[object, ...]:
    """Return a tuple of context-manager patches for the common dependencies."""
    session_mock = AsyncMock()
    session_mock.__aenter__ = AsyncMock(return_value=session_mock)
    session_mock.__aexit__ = AsyncMock(return_value=False)

    sm = MagicMock()
    sm.return_value = session_mock

    return (
        patch(
            "telaios.modules.document_extraction.service.get_job_tracker",
            return_value=tracker,
        ),
        patch(
            "telaios.modules.document_extraction.service.get_sessionmaker",
            return_value=sm,
        ),
    )


# ── run_analysis_job ──────────────────────────────────────────────────────────


class TestRunAnalysisJob:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        from telaios.modules.document_extraction.service import run_analysis_job

        tracker = AsyncMock()
        result_data = {"summary": "ok"}

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.analyse_document_chunks",
                new=AsyncMock(return_value=result_data),
            ),
        ):
            await run_analysis_job("job-1", "doc-uuid-1")

        calls = tracker.update_job.await_args_list
        assert calls[0].args == ("job-1",)
        assert calls[0].kwargs == {"status": "processing"}
        assert calls[1].kwargs["status"] == "completed"
        assert calls[1].kwargs["result"] == result_data

    @pytest.mark.asyncio
    async def test_failure_path(self) -> None:
        from telaios.modules.document_extraction.service import run_analysis_job

        tracker = AsyncMock()

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.analyse_document_chunks",
                new=AsyncMock(side_effect=RuntimeError("boom")),
            ),
        ):
            await run_analysis_job("job-1", "doc-uuid-1")

        last_call = tracker.update_job.await_args_list[-1]
        assert last_call.kwargs["status"] == "failed"
        assert "boom" in last_call.kwargs["error"]


# ── run_convert_job ───────────────────────────────────────────────────────────


class TestRunConvertJob:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        from telaios.modules.document_extraction.service import run_convert_job

        tracker = AsyncMock()
        result_data = {"content": "# Title"}

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.convert_document_chunks",
                new=AsyncMock(return_value=result_data),
            ),
        ):
            await run_convert_job("job-2", "doc-uuid-2", "markdown")

        calls = tracker.update_job.await_args_list
        assert calls[1].kwargs["status"] == "completed"
        assert calls[1].kwargs["result"] == result_data

    @pytest.mark.asyncio
    async def test_failure_path(self) -> None:
        from telaios.modules.document_extraction.service import run_convert_job

        tracker = AsyncMock()

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.convert_document_chunks",
                new=AsyncMock(side_effect=ValueError("bad format")),
            ),
        ):
            await run_convert_job("job-2", "doc-uuid-2", "html")

        last = tracker.update_job.await_args_list[-1]
        assert last.kwargs["status"] == "failed"


# ── run_extract_job ───────────────────────────────────────────────────────────


class TestRunExtractJob:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        from telaios.modules.document_extraction.service import run_extract_job

        tracker = AsyncMock()
        result_data = {"entities": []}

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.extract_chunks_structured",
                new=AsyncMock(return_value=result_data),
            ),
        ):
            await run_extract_job("job-3", "doc-uuid-3", {"type": "object"}, focus="tables")

        calls = tracker.update_job.await_args_list
        assert calls[1].kwargs["status"] == "completed"

    @pytest.mark.asyncio
    async def test_failure_path(self) -> None:
        from telaios.modules.document_extraction.service import run_extract_job

        tracker = AsyncMock()

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.extract_chunks_structured",
                new=AsyncMock(side_effect=RuntimeError("llm error")),
            ),
        ):
            await run_extract_job("job-3", "doc-uuid-3", {})

        last = tracker.update_job.await_args_list[-1]
        assert last.kwargs["status"] == "failed"


# ── run_summarize_job ─────────────────────────────────────────────────────────


class TestRunSummarizeJob:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        from telaios.modules.document_extraction.service import run_summarize_job

        tracker = AsyncMock()
        result_data = {"summary": "brief summary"}

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.summarize_document_chunks",
                new=AsyncMock(return_value=result_data),
            ),
        ):
            await run_summarize_job("job-4", "doc-uuid-4", level="brief", focus="intro")

        calls = tracker.update_job.await_args_list
        assert calls[1].kwargs["result"] == result_data

    @pytest.mark.asyncio
    async def test_failure_path(self) -> None:
        from telaios.modules.document_extraction.service import run_summarize_job

        tracker = AsyncMock()

        session_mock = AsyncMock()
        session_mock.__aenter__ = AsyncMock(return_value=session_mock)
        session_mock.__aexit__ = AsyncMock(return_value=False)
        sm = MagicMock(return_value=session_mock)

        with (
            patch(
                "telaios.modules.document_extraction.service.get_job_tracker",
                return_value=tracker,
            ),
            patch(
                "telaios.modules.document_extraction.service.get_sessionmaker",
                return_value=sm,
            ),
            patch(
                "telaios.modules.document_extraction.service_helpers.summarize_document_chunks",
                new=AsyncMock(side_effect=OSError("network error")),
            ),
        ):
            await run_summarize_job("job-4", "doc-uuid-4")

        last = tracker.update_job.await_args_list[-1]
        assert last.kwargs["status"] == "failed"
        assert "network error" in last.kwargs["error"]
