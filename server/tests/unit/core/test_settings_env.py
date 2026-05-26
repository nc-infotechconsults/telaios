"""tests/unit/core/test_settings_env.py — Settings env-file wiring (server)."""

from __future__ import annotations

from pathlib import Path

from telaios.config.settings import _ENV_FILE as ENV_FILE
from telaios.config.settings import Settings


def test_settings_uses_project_env_file() -> None:
    assert Settings.model_config.get("env_file") == str(ENV_FILE)
    assert Path(__file__).resolve().parents[4] / ".env" == ENV_FILE


def test_settings_reads_env_aliases_from_env_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AGENT_SERVICE_PORT=9001\nALLOWED_ORIGIN=http://localhost:5173\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=str(env_file))

    assert settings.PORT == 9001
    assert settings.ALLOWED_ORIGINS == "http://localhost:5173"


def test_code_graph_only_defaults_false():
    from telaios.core.knowledge.config import KnowledgePipelineConfig
    cfg = KnowledgePipelineConfig()
    assert cfg.code_graph_only is False
