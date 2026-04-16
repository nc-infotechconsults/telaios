from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class TestFramework:
    name: str
    command: str
    pass_pattern: str
    fail_pattern: str


@dataclass
class TestRunResult:
    framework: str
    passed: int
    failed: int
    output: str
    success: bool
    duration_ms: int


_KNOWN_FRAMEWORKS = [
    TestFramework("vitest", "npx vitest run --reporter verbose 2>&1", r"(\d+)\s+passed", r"(\d+)\s+failed"),
    TestFramework("jest", "npx jest --no-coverage 2>&1", r"Tests:\s+.*?(\d+)\s+passed", r"Tests:\s+.*?(\d+)\s+failed"),
    TestFramework("mocha", "npx mocha 2>&1", r"(\d+)\s+passing", r"(\d+)\s+failing"),
    TestFramework("pytest", "python -m pytest -v 2>&1", r"(\d+)\s+passed", r"(\d+)\s+failed"),
    TestFramework("go-test", "go test ./... 2>&1", r"ok\s+", r"FAIL\s+"),
    TestFramework("cargo-test", "cargo test 2>&1", r"(\d+)\s+passed", r"(\d+)\s+failed"),
]


async def detect_framework(workspace_path: str) -> Optional[TestFramework]:
    """Detect the test framework used by the workspace."""
    pkg_json = os.path.join(workspace_path, "package.json")
    if os.path.isfile(pkg_json):
        try:
            with open(pkg_json, "r", encoding="utf-8") as fh:
                pkg = json.load(fh)
            all_deps = {**pkg.get("devDependencies", {}), **pkg.get("dependencies", {})}
            scripts = pkg.get("scripts", {})
            if "vitest" in all_deps or "vitest" in scripts.get("test", ""):
                return next(f for f in _KNOWN_FRAMEWORKS if f.name == "vitest")
            if "jest" in all_deps or "jest" in scripts.get("test", ""):
                return next(f for f in _KNOWN_FRAMEWORKS if f.name == "jest")
            if "mocha" in all_deps or "mocha" in scripts.get("test", ""):
                return next(f for f in _KNOWN_FRAMEWORKS if f.name == "mocha")
        except Exception:
            pass

    for indicator, name in [
        ("pytest.ini", "pytest"), ("pyproject.toml", "pytest"), ("requirements.txt", "pytest"),
        ("go.mod", "go-test"), ("Cargo.toml", "cargo-test"),
    ]:
        indicator_path = os.path.join(workspace_path, indicator)
        if os.path.isfile(indicator_path):
            if name == "pytest":
                try:
                    with open(indicator_path, "r") as fh:
                        if "pytest" in fh.read() or indicator == "pytest.ini":
                            return next(f for f in _KNOWN_FRAMEWORKS if f.name == "pytest")
                    continue
                except Exception:
                    pass
            return next(f for f in _KNOWN_FRAMEWORKS if f.name == name)

    return None


async def run_tests(
    workspace_path: str,
    framework: TestFramework,
    timeout_ms: int = 300_000,
) -> TestRunResult:
    """Run the detected test framework in the workspace directory."""
    import re
    import time

    start = time.monotonic()
    output = ""
    exit_code = 0

    try:
        proc = await asyncio.create_subprocess_shell(
            framework.command,
            cwd=workspace_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_ms / 1000)
            output = stdout.decode(errors="replace")
            exit_code = proc.returncode or 0
        except asyncio.TimeoutError:
            proc.kill()
            output = "Tests timed out"
            exit_code = 1
    except Exception as exc:
        output = str(exc)
        exit_code = 1

    duration_ms = int((time.monotonic() - start) * 1000)

    pass_match = re.search(framework.pass_pattern, output, re.IGNORECASE)
    fail_match = re.search(framework.fail_pattern, output, re.IGNORECASE)

    passed = int(pass_match.group(1)) if pass_match and pass_match.lastindex else (1 if exit_code == 0 else 0)
    failed = int(fail_match.group(1)) if fail_match and fail_match.lastindex else (1 if exit_code != 0 else 0)

    return TestRunResult(
        framework=framework.name,
        passed=passed,
        failed=failed,
        output=output[:8000],
        success=exit_code == 0 and failed == 0,
        duration_ms=duration_ms,
    )
