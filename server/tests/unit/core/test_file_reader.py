"""Unit tests for FileReader implementations."""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest


class TestLocalFileReader:
    @pytest.fixture
    def tmp_file(self, tmp_path: Path) -> Path:
        f = tmp_path / "sample.py"
        f.write_text("line1\nline2\nline3\nline4\nline5\n")
        return f

    async def test_read_full_file(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file))
        assert content == "line1\nline2\nline3\nline4\nline5\n"

    async def test_read_line_range(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file), start_line=2, end_line=3)
        assert content == "line2\nline3\n"

    async def test_read_with_context_padding(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file), start_line=3, end_line=3, context_lines=1)
        assert "line2" in content
        assert "line3" in content
        assert "line4" in content

    async def test_context_padding_clamps_at_file_boundaries(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        # start_line=1 with context_lines=5 should not go negative
        content = await reader.read(str(tmp_file), start_line=1, end_line=1, context_lines=5)
        assert "line1" in content  # no error, starts at line 1


class TestS3FileReader:
    def _mock_s3(self, content: str) -> MagicMock:
        s3 = MagicMock()
        s3.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=content.encode("utf-8")))
        }
        return s3

    async def test_read_full_file_from_s3(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("a\nb\nc\n")
        reader = S3FileReader(s3_client=s3, bucket="my-bucket")
        content = await reader.read("repo/file.py")
        s3.get_object.assert_called_once_with(Bucket="my-bucket", Key="repo/file.py")
        assert content == "a\nb\nc\n"

    async def test_key_prefix_prepended(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("x\n")
        reader = S3FileReader(s3_client=s3, bucket="b", key_prefix="projects/repo1")
        await reader.read("src/Foo.java")
        s3.get_object.assert_called_once_with(
            Bucket="b", Key="projects/repo1/src/Foo.java"
        )

    async def test_read_line_range_from_s3(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("line1\nline2\nline3\nline4\n")
        reader = S3FileReader(s3_client=s3, bucket="b")
        content = await reader.read("f.py", start_line=2, end_line=3)
        assert content == "line2\nline3\n"


class TestSliceLines:
    def test_full_content_when_no_start_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        assert _slice_lines("a\nb\nc\n", None, None, 0) == "a\nb\nc\n"

    def test_single_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        assert _slice_lines("a\nb\nc\n", 2, 2, 0) == "b\n"

    def test_end_line_defaults_to_start_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        result = _slice_lines("a\nb\nc\n", 1, None, 0)
        assert result == "a\n"
