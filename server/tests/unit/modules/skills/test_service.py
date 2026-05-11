"""tests/unit/modules/skills/test_service.py

Unit tests for skills service functions:
  list_skills, get_skill, get_skill_scripts, search_skills,
  reload_skills, install_skill
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch


def _make_manifest(
    name: str = "my-skill",
    description: str = "Does something",
    version: str = "1.0.0",
    tags: list[str] | None = None,
    author: str | None = None,
    instructions: str = "Run it.",
    scripts: list[object] | None = None,
    root_path: str = "/skills/my-skill",
) -> MagicMock:
    m = MagicMock()
    m.name = name
    m.description = description
    m.version = version
    fm = MagicMock()
    fm.tags = tags or []
    fm.author = author
    m.frontmatter = fm
    m.instructions = instructions
    m.scripts = scripts or []
    m.root_path = root_path
    return m


def _make_script(
    name: str = "run.sh",
    path: str = "/skills/my-skill/scripts/run.sh",
    description: str = "Runs the skill",
    arguments: list[object] | None = None,
) -> MagicMock:
    s = MagicMock()
    s.name = name
    s.path = path
    s.description = description
    s.arguments = arguments or []
    return s


# ── list_skills ───────────────────────────────────────────────────────────────


class TestListSkills:
    def test_empty_registry(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_registry.list.return_value = []

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.list_skills()

        assert result == []

    def test_returns_summaries(self) -> None:
        from telaios.modules.skills import service as svc_mod

        manifests = [_make_manifest(name=f"skill-{i}") for i in range(3)]
        mock_registry = MagicMock()
        mock_registry.list.return_value = manifests

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.list_skills()

        assert len(result) == 3
        assert result[0]["name"] == "skill-0"
        assert "instructions" not in result[0]

    def test_summary_has_expected_keys(self) -> None:
        from telaios.modules.skills import service as svc_mod

        m = _make_manifest(author="Bob", tags=["code"], version="2.0")
        script = _make_script()
        m.scripts = [script]
        mock_registry = MagicMock()
        mock_registry.list.return_value = [m]

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.list_skills()

        assert result[0]["author"] == "Bob"
        assert result[0]["tags"] == ["code"]
        assert result[0]["script_count"] == 1


# ── get_skill ─────────────────────────────────────────────────────────────────


class TestGetSkill:
    def test_found_returns_detail(self) -> None:
        from telaios.modules.skills import service as svc_mod

        script = _make_script()
        m = _make_manifest(instructions="Do X then Y.", scripts=[script])
        mock_registry = MagicMock()
        mock_registry.get.return_value = m

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.get_skill("my-skill")

        assert result is not None
        assert result["name"] == "my-skill"
        assert result["instructions"] == "Do X then Y."
        assert len(result["scripts"]) == 1
        assert result["root_path"] == "/skills/my-skill"

    def test_not_found_returns_none(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_registry.get.return_value = None

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.get_skill("missing-skill")

        assert result is None


# ── get_skill_scripts ─────────────────────────────────────────────────────────


class TestGetSkillScripts:
    def test_returns_scripts_list(self) -> None:
        from telaios.modules.skills import service as svc_mod

        s1 = _make_script(name="deploy.sh", description="Deploys")
        s2 = _make_script(name="test.sh", description="Tests")
        m = _make_manifest(scripts=[s1, s2])
        mock_registry = MagicMock()
        mock_registry.get.return_value = m

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.get_skill_scripts("my-skill")

        assert result is not None
        assert len(result) == 2
        assert result[0]["name"] == "deploy.sh"
        assert result[1]["description"] == "Tests"

    def test_not_found_returns_none(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_registry.get.return_value = None

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.get_skill_scripts("nonexistent")

        assert result is None


# ── search_skills ─────────────────────────────────────────────────────────────


class TestSearchSkills:
    def test_returns_search_response(self) -> None:
        from telaios.modules.skills import service as svc_mod

        manifests = [_make_manifest(name="skill-ai"), _make_manifest(name="skill-tools")]
        mock_registry = MagicMock()
        mock_registry.search.return_value = [(m, 0.9) for m in manifests]

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.search_skills("ai")

        assert result["query"] == "ai"
        assert result["total"] == 2
        assert len(result["results"]) == 2

    def test_limit_applied(self) -> None:
        from telaios.modules.skills import service as svc_mod

        manifests = [_make_manifest(name=f"skill-{i}") for i in range(20)]
        mock_registry = MagicMock()
        mock_registry.search.return_value = [(m, 0.5) for m in manifests]

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.search_skills("x", limit=5)

        assert len(result["results"]) == 5
        assert result["total"] == 20

    def test_empty_results(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_registry.search.return_value = []

        with patch.object(svc_mod, "get_registry", return_value=mock_registry):
            result = svc_mod.search_skills("zzz")

        assert result["results"] == []
        assert result["total"] == 0


# ── reload_skills ─────────────────────────────────────────────────────────────


class TestReloadSkills:
    def test_reload_loads_skills(self) -> None:
        from telaios.modules.skills import service as svc_mod

        manifests = [_make_manifest()]
        mock_registry = MagicMock()
        mock_validation = MagicMock()
        mock_validation.is_valid = True
        mock_validation.errors = []

        mock_settings = MagicMock()
        mock_settings.SKILLS_DIRECTORY = "/skills"
        mock_settings.SKILLS_EXTRA_PATHS = ""

        with (
            patch.object(svc_mod, "get_registry", return_value=mock_registry),
            patch.object(svc_mod, "get_settings", return_value=mock_settings),
            patch("telaios.tools.skill.loader.SkillDirectoryScanner") as mock_scanner,
            patch(
                "telaios.tools.skill.validator.validate_skill_manifest",
                return_value=mock_validation,
            ),
        ):
            mock_scanner.scan.return_value = manifests
            result = svc_mod.reload_skills()

        assert result["loaded"] == 1
        assert result["errors"] == []
        mock_registry.clear.assert_called_once()

    def test_reload_records_errors(self) -> None:
        from telaios.modules.skills import service as svc_mod

        manifests = [_make_manifest()]
        mock_registry = MagicMock()
        mock_validation = MagicMock()
        mock_validation.is_valid = False
        mock_validation.errors = ["missing description"]

        mock_settings = MagicMock()
        mock_settings.SKILLS_DIRECTORY = "/skills"
        mock_settings.SKILLS_EXTRA_PATHS = ""

        with (
            patch.object(svc_mod, "get_registry", return_value=mock_registry),
            patch.object(svc_mod, "get_settings", return_value=mock_settings),
            patch("telaios.tools.skill.loader.SkillDirectoryScanner") as mock_scanner,
            patch(
                "telaios.tools.skill.validator.validate_skill_manifest",
                return_value=mock_validation,
            ),
        ):
            mock_scanner.scan.return_value = manifests
            result = svc_mod.reload_skills()

        assert result["loaded"] == 0
        assert "missing description" in result["errors"]

    def test_reload_scan_exception_captured(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_settings = MagicMock()
        mock_settings.SKILLS_DIRECTORY = "/skills"
        mock_settings.SKILLS_EXTRA_PATHS = ""

        with (
            patch.object(svc_mod, "get_registry", return_value=mock_registry),
            patch.object(svc_mod, "get_settings", return_value=mock_settings),
            patch("telaios.tools.skill.loader.SkillDirectoryScanner") as mock_scanner,
        ):
            mock_scanner.scan.side_effect = OSError("no such directory")
            result = svc_mod.reload_skills()

        assert result["loaded"] == 0
        assert any("Failed to load" in e for e in result["errors"])


# ── install_skill ─────────────────────────────────────────────────────────────


class TestInstallSkill:
    def test_successful_install(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_settings = MagicMock()
        mock_settings.SKILLS_DIRECTORY = "/skills"

        install_result = MagicMock()
        install_result.success = True
        install_result.skill_name = "new-skill"
        install_result.target_path = "/skills/new-skill"
        install_result.errors = []

        manifest = _make_manifest(name="new-skill")

        with (
            patch.object(svc_mod, "get_registry", return_value=mock_registry),
            patch.object(svc_mod, "get_settings", return_value=mock_settings),
            patch("telaios.tools.skill.packager.SkillInstaller") as mock_installer,
            patch("telaios.tools.skill.loader.SkillDirectoryScanner") as mock_scanner,
        ):
            mock_installer.return_value.install_from_zip.return_value = install_result
            mock_scanner.scan.return_value = [manifest]
            result = svc_mod.install_skill("/tmp/new-skill.zip")

        assert result["success"] is True
        assert result["skill_name"] == "new-skill"
        mock_registry.add.assert_called_once_with(manifest)

    def test_failed_install(self) -> None:
        from telaios.modules.skills import service as svc_mod

        mock_registry = MagicMock()
        mock_settings = MagicMock()
        mock_settings.SKILLS_DIRECTORY = "/skills"

        install_result = MagicMock()
        install_result.success = False
        install_result.skill_name = None
        install_result.target_path = None
        install_result.errors = ["invalid zip"]

        with (
            patch.object(svc_mod, "get_registry", return_value=mock_registry),
            patch.object(svc_mod, "get_settings", return_value=mock_settings),
            patch("telaios.tools.skill.packager.SkillInstaller") as mock_installer,
        ):
            mock_installer.return_value.install_from_zip.return_value = install_result
            result = svc_mod.install_skill("/tmp/bad.zip")

        assert result["success"] is False
        assert "invalid zip" in result["errors"]
        mock_registry.add.assert_not_called()
