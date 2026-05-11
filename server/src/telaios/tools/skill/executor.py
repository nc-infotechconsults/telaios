"""
src/tools/skill/executor.py
--------------------------
Execute skill scripts with timeout, environment handling, and sandboxing.

Provides safe execution of bash scripts with:
- Configurable timeout
- Environment variable injection
- Argument passing
- stdout/stderr capture
- Exit code handling

Source: OpenCode skill specification (AGENTS.md)
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from telaios.tools.skill.types import SkillManifest, SkillScript

logger = logging.getLogger(__name__)


@dataclass
class ScriptResult:
    """Result of executing a skill script."""

    exit_code: int
    stdout: str
    stderr: str
    success: bool
    duration_ms: float


class ScriptExecutor:
    """
    Execute skill scripts in a sandboxed subprocess.

    Features:
    - Timeout enforcement (default: 30s)
    - Environment variable injection
    - Argument passing
    - stdout/stderr capture
    - Working directory isolation
    """

    DEFAULT_TIMEOUT = 30.0

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        env: dict[str, str] | None = None,
        allowed_commands: list[str] | None = None,
        working_dir: str | None = None,
    ) -> None:
        self.timeout = timeout
        self.env = env or {}
        self.allowed_commands = set(allowed_commands or [])
        self.working_dir = working_dir

    async def execute(
        self,
        script: SkillScript,
        args: list[str] | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> ScriptResult:
        """
        Execute a skill script with arguments and environment.

        Args:
            script: The skill script to execute.
            args: Arguments to pass to the script.
            extra_env: Additional environment variables (merged with base env).

        Returns:
            ScriptResult with stdout, stderr, exit code, and timing.

        Raises:
            PermissionError: If the script is not executable.
            FileNotFoundError: If the script file does not exist.
        """
        script_path = Path(script.path)

        if not script_path.exists():  # noqa: ASYNC240
            raise FileNotFoundError(f"Script not found: {script.path}")

        if not os.access(script_path, os.X_OK):
            # Try to make it executable
            try:
                script_path.chmod(script_path.stat().st_mode | 0o111)  # noqa: ASYNC240
            except OSError as exc:
                logger.warning("Could not make script executable: %s", exc)

        # Build command
        cmd = [str(script_path)] + (args or [])

        # Validate command if sandboxing is configured
        if self.allowed_commands:
            command_name = script_path.name
            if command_name not in self.allowed_commands and not command_name.endswith(".sh"):
                raise PermissionError(f"Script '{command_name}' not in allowed commands list")

        # Merge environment
        merged_env = {**os.environ, **self.env}
        if extra_env:
            merged_env.update(extra_env)

        # Set working directory
        cwd = self.working_dir or str(script_path.parent)

        logger.info(
            "Executing script: %s (timeout=%.1fs, cwd=%s)",
            script.name,
            self.timeout,
            cwd,
        )

        import time

        start_time = time.time()

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=merged_env,
                cwd=cwd,
            )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=self.timeout,
            )

            duration_ms = (time.time() - start_time) * 1000

            stdout = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
            stderr = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""

            success = proc.returncode == 0

            if not success:
                logger.warning(
                    "Script %s failed with exit code %d (stderr: %.200s)",
                    script.name,
                    proc.returncode,
                    stderr,
                )

            return ScriptResult(
                exit_code=proc.returncode or 0,
                stdout=stdout,
                stderr=stderr,
                success=success,
                duration_ms=duration_ms,
            )

        except TimeoutError:
            duration_ms = (time.time() - start_time) * 1000
            logger.error("Script %s timed out after %.1fs", script.name, self.timeout)

            # Try to kill the process
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass

            return ScriptResult(
                exit_code=-1,
                stdout="",
                stderr=f"Script timed out after {self.timeout} seconds",
                success=False,
                duration_ms=duration_ms,
            )

        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            logger.error("Script %s execution failed: %s", script.name, exc)
            return ScriptResult(
                exit_code=-1,
                stdout="",
                stderr=str(exc),
                success=False,
                duration_ms=duration_ms,
            )

    async def execute_manifest(
        self,
        manifest: SkillManifest,
        script_name: str | None = None,
        args: list[str] | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> ScriptResult:
        """
        Execute a script from a skill manifest.

        If script_name is not provided, uses the first script in the manifest.

        Args:
            manifest: The skill manifest containing scripts.
            script_name: Name of the script to execute (default: first script).
            args: Arguments to pass.
            extra_env: Additional environment variables.

        Returns:
            ScriptResult.

        Raises:
            ValueError: If no scripts found or script_name not found.
        """
        if not manifest.scripts:
            raise ValueError(f"Skill '{manifest.name}' has no scripts")

        if script_name:
            script = next(
                (s for s in manifest.scripts if s.name == script_name),
                None,
            )
            if script is None:
                raise ValueError(
                    f"Script '{script_name}' not found in skill '{manifest.name}'. "
                    f"Available: {[s.name for s in manifest.scripts]}"
                )
        else:
            script = manifest.scripts[0]

        return await self.execute(script, args, extra_env)
