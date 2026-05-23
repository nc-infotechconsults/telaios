"""serve_llm — launch vllm-mlx server from the project virtualenv.

Entry point: ``uv run serve-llm``
"""

from __future__ import annotations

import subprocess
import sys


_CMD = [
    "vllm-mlx",
    "serve",
    "mlx-community/gemma-4-e2b-it-4bit",
    # "mlx-community/Qwen3.5-9B-MLX-4bit",
    "--port", "8000",
    # "--continuous-batching",
    "--enable-prefix-cache",
    # "--reasoning-parser", "qwen3",
    "--reasoning-parser", "gemma4",
    "--enable-auto-tool-choice",
    "--tool-call-parser", "gemma4",
    # "--tool-call-parser", "qwen",
    "--max-tokens", "16384",
]


def main() -> None:
    try:
        result = subprocess.run(_CMD)
        sys.exit(result.returncode)
    except FileNotFoundError:
        print(
            "vllm-mlx not found in virtualenv.\n"
            "Run: uv sync --group dev",
            file=sys.stderr,
        )
        sys.exit(1)
