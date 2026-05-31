"""Smoke test: ProjectSkillRead serialization."""
import uuid
from datetime import datetime
from telaios.modules.projects.skills.schemas import ProjectSkillRead


def test_project_skill_read_fields():
    skill = ProjectSkillRead(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        cloned_from_library_skill_id=None,
        name="My Skill",
        slug="my-skill",
        description=None,
        content="# Skill content",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    assert skill.slug == "my-skill"
    assert skill.content == "# Skill content"
