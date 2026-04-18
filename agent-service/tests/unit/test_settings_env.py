from __future__ import annotations

from pathlib import Path

from agent_service.config import ENV_FILE, Settings


def test_settings_uses_agent_service_env_file() -> None:
    assert Settings.model_config.get("env_file") == str(ENV_FILE)
    assert ENV_FILE == Path(__file__).resolve().parents[2] / ".env"


def test_settings_reads_env_aliases_from_env_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AGENT_SERVICE_PORT=9001\nALLOWED_ORIGIN=http://localhost:5173\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=str(env_file))

    assert settings.PORT == 9001
    assert settings.ALLOWED_ORIGINS == "http://localhost:5173"
