"""Unit tests for knowledge_source denylist (_is_text_file)."""

from __future__ import annotations

from pathlib import Path

import pytest

from telaios.core.knowledge_source import _is_text_file


# ── Binary extensions: rejected ───────────────────────────────────────────────


class TestBinaryExtensions:
    @pytest.mark.parametrize("name", [
        "App.class", "lib.jar", "module.war",
        "image.png", "photo.jpg", "icon.ico",
        "archive.zip", "bundle.tar.gz",
        "binary.exe", "library.dll", "object.so",
        "data.db", "store.sqlite",
        "module.pyc", "cache.pyo",
        "document.pdf", "spreadsheet.xlsx",
    ])
    def test_binary_extension_rejected(self, name: str, tmp_path: Path):
        f = tmp_path / name
        f.write_bytes(b"\x00\x01\x02")
        assert not _is_text_file(f), f"Expected {name} to be rejected"


# ── Text / source files: accepted ─────────────────────────────────────────────


class TestTextFileAccepted:
    @pytest.mark.parametrize("name", [
        "Main.java",
        "service.py",
        "index.ts",
        "component.tsx",
        "app.js",
        "utils.jsx",
        "config.yaml",
        "settings.yml",
        "README.md",
        "notes.txt",
        "build.gradle",
        "pom.xml",
        "Dockerfile",
        "Makefile",
        ".env.example",
        "data.json",
        "query.sql",
        "schema.graphql",
        "main.go",
        "lib.rs",
        "app.rb",
    ])
    def test_text_file_accepted(self, name: str, tmp_path: Path):
        f = tmp_path / name
        f.write_text("some content", encoding="utf-8")
        assert _is_text_file(f), f"Expected {name} to be accepted"


# ── Excluded directories: rejected anywhere in path ──────────────────────────


class TestExcludedDirectories:
    @pytest.mark.parametrize("dir_name", [
        "node_modules", ".git", "dist", "build", "target",
        ".venv", "venv", "__pycache__", ".gradle", "vendor",
    ])
    def test_file_in_excluded_dir_rejected(self, dir_name: str, tmp_path: Path):
        excluded = tmp_path / dir_name
        excluded.mkdir()
        f = excluded / "Main.java"
        f.write_text("public class Main {}", encoding="utf-8")
        assert not _is_text_file(f), f"File in {dir_name}/ should be rejected"

    def test_nested_excluded_dir_rejected(self, tmp_path: Path):
        nested = tmp_path / "src" / "node_modules" / "lib"
        nested.mkdir(parents=True)
        f = nested / "index.js"
        f.write_text("module.exports = {}", encoding="utf-8")
        assert not _is_text_file(f)


# ── Excluded filenames: rejected ──────────────────────────────────────────────


class TestExcludedFilenames:
    @pytest.mark.parametrize("name", [
        "package-lock.json", "yarn.lock", "Pipfile.lock",
        "poetry.lock", "uv.lock", "Cargo.lock",
        "pnpm-lock.yaml", ".DS_Store", "Thumbs.db",
    ])
    def test_lockfile_rejected(self, name: str, tmp_path: Path):
        f = tmp_path / name
        f.write_text("{}", encoding="utf-8")
        assert not _is_text_file(f), f"Expected {name} to be rejected"


# ── Minified files: rejected ──────────────────────────────────────────────────


class TestMinifiedFiles:
    @pytest.mark.parametrize("name", [
        "app.min.js", "styles.min.css", "bundle.min.mjs",
    ])
    def test_minified_file_rejected(self, name: str, tmp_path: Path):
        f = tmp_path / name
        f.write_text("(function(){var a=1})()", encoding="utf-8")
        assert not _is_text_file(f), f"Expected minified file {name} to be rejected"


# ── Null-byte binary detection ────────────────────────────────────────────────


class TestNullByteBinaryDetection:
    def test_file_with_null_bytes_rejected(self, tmp_path: Path):
        f = tmp_path / "weird.dat"
        f.write_bytes(b"some text\x00more text")
        assert not _is_text_file(f)

    def test_clean_text_file_no_null_accepted(self, tmp_path: Path):
        f = tmp_path / "clean.txt"
        f.write_text("clean utf-8 content", encoding="utf-8")
        assert _is_text_file(f)
