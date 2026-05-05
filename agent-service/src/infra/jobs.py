from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Job:
    id: str
    type: str
    status: str = "pending"
    document_id: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    result: dict[str, Any] | None = None
    error: str | None = None
    progress: int = 0


class JobTracker:
    TTL_SECONDS = 3600
    CLEANUP_INTERVAL = 300

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: asyncio.Task | None = None

    def start(self) -> None:
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self) -> None:
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    def create_job(self, job_type: str, document_id: str | None = None) -> str:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        self._jobs[job_id] = Job(id=job_id, type=job_type, document_id=document_id)
        logger.info("Created job %s (type=%s)", job_id, job_type)
        return job_id

    async def update_job(
        self,
        job_id: str,
        status: str | None = None,
        progress: int | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                logger.warning("Update for unknown job: %s", job_id)
                return
            if status:
                job.status = status
            if progress is not None:
                job.progress = progress
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            job.updated_at = time.time()

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list_jobs(
        self,
        document_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[Job]:
        jobs = list(self._jobs.values())
        if document_id:
            jobs = [job for job in jobs if job.document_id == document_id]
        if status:
            jobs = [job for job in jobs if job.status == status]
        jobs.sort(key=lambda job: job.created_at, reverse=True)
        return jobs[:limit]

    async def _cleanup_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.CLEANUP_INTERVAL)
                await self._cleanup()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Job cleanup error: %s", exc)

    async def _cleanup(self) -> None:
        now = time.time()
        expired = [
            job_id
            for job_id, job in self._jobs.items()
            if now - job.updated_at > self.TTL_SECONDS
        ]
        for job_id in expired:
            del self._jobs[job_id]
        if expired:
            logger.info("Cleaned up %d expired jobs", len(expired))


_job_tracker: JobTracker | None = None


def get_job_tracker() -> JobTracker:
    global _job_tracker
    if _job_tracker is None:
        _job_tracker = JobTracker()
    return _job_tracker
