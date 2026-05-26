"""FileReader — abstraction for reading source files from local disk or S3."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class FileReader(Protocol):
    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str: ...


class LocalFileReader:
    """Reads files from local disk. Covers FileSource, local GitSource, cloned GitHubSource."""

    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str:
        def _read_sync() -> str:
            with open(file_path, encoding="utf-8", errors="replace") as fh:
                return fh.read()

        try:
            content = await asyncio.get_running_loop().run_in_executor(None, _read_sync)
        except OSError as exc:
            logger.warning("LocalFileReader: cannot read %r — %s", file_path, exc)
            return ""
        return _slice_lines(content, start_line, end_line, context_lines)


class S3FileReader:
    """Reads files from an S3 bucket. Covers S3-hosted local repository versions."""

    def __init__(self, s3_client: Any, bucket: str, key_prefix: str = "") -> None:
        self._s3 = s3_client
        self._bucket = bucket
        self._key_prefix = key_prefix.rstrip("/")

    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str:
        key = f"{self._key_prefix}/{file_path}" if self._key_prefix else file_path

        def _fetch() -> str:
            response = self._s3.get_object(Bucket=self._bucket, Key=key)
            return response["Body"].read().decode("utf-8", errors="replace")

        try:
            content = await asyncio.get_running_loop().run_in_executor(None, _fetch)
        except Exception as exc:
            logger.warning("S3FileReader: cannot fetch %r from %r — %s", key, self._bucket, exc)
            return ""
        return _slice_lines(content, start_line, end_line, context_lines)


def _slice_lines(
    content: str,
    start_line: int | None,
    end_line: int | None,
    context_lines: int,
) -> str:
    if start_line is None:
        return content
    lines = content.splitlines(keepends=True)
    s = max(0, (start_line - 1) - context_lines)
    e = min(len(lines), (end_line or start_line) + context_lines)
    return "".join(lines[s:e])


class FileReaderFactory:
    @staticmethod
    def local() -> LocalFileReader:
        return LocalFileReader()

    @staticmethod
    def s3(s3_client: Any, bucket: str, key_prefix: str = "") -> S3FileReader:
        return S3FileReader(s3_client=s3_client, bucket=bucket, key_prefix=key_prefix)


__all__ = ["FileReader", "LocalFileReader", "S3FileReader", "FileReaderFactory", "_slice_lines"]
