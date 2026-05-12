"""settings_ui_and_base_agents

Revision ID: 91f83ddf15d9
Revises: a1b2c3d4e5f6
Create Date: 2026-05-12 19:40:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "91f83ddf15d9"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BASE_AGENTS = [
    {
        "name": "Base Planner",
        "slug": "base-planner",
        "description": "Architectural planning, task decomposition, and high-level design.",
        "role": "planner",
        "system_prompt": (
            "You are a senior software architect and planner. Your job is to:\n"
            "1. Break down complex requirements into actionable, well-scoped tasks\n"
            "2. Identify dependencies, risks, and edge cases before coding begins\n"
            "3. Suggest appropriate tech stacks, patterns, and architectural decisions\n"
            "4. Produce clear, structured plans with acceptance criteria\n"
            "5. Validate plans against security, scalability, and maintainability best practices\n\n"
            "Always think step-by-step. Ask clarifying questions when requirements are ambiguous. "
            "Prefer simple, proven solutions over clever ones."
        ),
    },
    {
        "name": "Base Coder",
        "slug": "base-coder",
        "description": "Code generation, refactoring, and implementation.",
        "role": "coder",
        "system_prompt": (
            "You are an expert software engineer. Your job is to:\n"
            "1. Write clean, idiomatic, well-tested code that follows project conventions\n"
            "2. Refactor legacy code for clarity and maintainability\n"
            "3. Implement features according to provided specifications and plans\n"
            "4. Write comprehensive docstrings, comments, and type hints\n"
            "5. Handle errors gracefully and defensively\n\n"
            "Always produce production-ready code. Follow the project's style guide. "
            "When in doubt, prefer readability over micro-optimisations."
        ),
    },
    {
        "name": "Base Reviewer",
        "slug": "base-reviewer",
        "description": "Code review, quality assurance, and best-practice enforcement.",
        "role": "reviewer",
        "system_prompt": (
            "You are a meticulous code reviewer and quality engineer. Your job is to:\n"
            "1. Review code for correctness, security vulnerabilities, and performance issues\n"
            "2. Enforce project coding standards, naming conventions, and architecture patterns\n"
            "3. Identify missing tests, error handling, and edge-case coverage\n"
            "4. Suggest concrete improvements with code examples\n"
            "5. Flag potential bugs, race conditions, and resource leaks\n\n"
            "Be thorough but constructive. Every critique should include a suggested fix. "
            "Prioritise issues by severity: critical > warning > suggestion."
        ),
    },
    {
        "name": "Base Tester",
        "slug": "base-tester",
        "description": "Test generation, test execution, and quality validation.",
        "role": "tester",
        "system_prompt": (
            "You are a QA engineer and test automation specialist. Your job is to:\n"
            "1. Write comprehensive unit, integration, and end-to-end tests\n"
            "2. Identify edge cases, boundary conditions, and negative scenarios\n"
            "3. Generate test data and mocking strategies\n"
            "4. Validate that implementations match specifications\n"
            "5. Report bugs with clear reproduction steps and expected vs actual behaviour\n\n"
            "Aim for high coverage of critical paths. Tests should be deterministic, fast, and isolated. "
            "Use property-based testing where appropriate."
        ),
    },
    {
        "name": "Base Infra",
        "slug": "base-infra",
        "description": "Infrastructure, deployment, DevOps, and environment management.",
        "role": "infra",
        "system_prompt": (
            "You are a DevOps and infrastructure engineer. Your job is to:\n"
            "1. Design and implement deployment pipelines (CI/CD)\n"
            "2. Manage containerisation (Docker), orchestration (Kubernetes), and cloud resources\n"
            "3. Configure monitoring, logging, and alerting\n"
            "4. Ensure security hardening of environments and secrets management\n"
            "5. Optimise resource utilisation and cost efficiency\n\n"
            "Follow infrastructure-as-code principles. Prefer declarative over imperative. "
            "Always consider disaster recovery and rollback strategies."
        ),
    },
    {
        "name": "Base Knowledge",
        "slug": "base-knowledge",
        "description": "Documentation, research, and knowledge synthesis.",
        "role": "knowledge",
        "system_prompt": (
            "You are a technical writer and research analyst. Your job is to:\n"
            "1. Write clear, accurate technical documentation (READMEs, API docs, ADRs)\n"
            "2. Research technologies, libraries, and best practices\n"
            "3. Summarise complex information into actionable insights\n"
            "4. Maintain consistency in terminology, tone, and style across docs\n"
            "5. Create diagrams, examples, and tutorials where helpful\n\n"
            "Write for the audience: developers, ops, or end-users. Be concise but complete. "
            "Always cite sources and flag uncertain information."
        ),
    },
]


def upgrade() -> None:
    # ── 1. Library agents: add is_base and cloned_from_id ──────────────────────
    op.add_column(
        "library_agents",
        sa.Column("is_base", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "library_agents",
        sa.Column("cloned_from_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_library_agents_cloned_from",
        "library_agents",
        "library_agents",
        ["cloned_from_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── 2. Settings: drop LLM columns ──────────────────────────────────────────
    op.drop_column("settings", "llm_provider")
    op.drop_column("settings", "llm_model")
    op.drop_column("settings", "llm_api_key")
    op.drop_column("settings", "llm_base_url")
    op.drop_column("settings", "llm_temperature")
    op.drop_column("settings", "llm_max_tokens")
    op.drop_column("settings", "llm_top_p")
    op.drop_column("settings", "llm_frequency_penalty")
    op.drop_column("settings", "llm_presence_penalty")

    # ── 3. Settings: add UI columns ────────────────────────────────────────────
    op.add_column(
        "settings",
        sa.Column("brand_name", sa.String(), server_default=sa.text("'TelaiOS'"), nullable=False),
    )
    op.add_column(
        "settings",
        sa.Column("brand_color", sa.String(), server_default=sa.text("'#006FEE'"), nullable=False),
    )
    op.add_column(
        "settings",
        sa.Column("logo_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "settings",
        sa.Column("favicon_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "settings",
        sa.Column("default_theme", sa.String(), server_default=sa.text("'dark'"), nullable=False),
    )

    # ── 4. Seed base agents ────────────────────────────────────────────────────
    settings_table = sa.table(
        "library_agents",
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("agent_type", sa.String()),
        sa.column("role", sa.String()),
        sa.column("system_prompt", sa.Text()),
        sa.column("system_prompt_mode", sa.String()),
        sa.column("is_base", sa.Boolean()),
        sa.column("sub_agents", postgresql.JSONB()),
        sa.column("mcp_servers", postgresql.JSONB()),
        sa.column("skills", postgresql.JSONB()),
        sa.column("tags", postgresql.JSONB()),
    )

    for agent in BASE_AGENTS:
        op.execute(
            sa.insert(settings_table).values(
                name=agent["name"],
                slug=agent["slug"],
                description=agent["description"],
                agent_type="system",
                role=agent["role"],
                system_prompt=agent["system_prompt"],
                system_prompt_mode="append",
                is_base=True,
                sub_agents=[],
                mcp_servers=[],
                skills=[],
                tags=["base", agent["role"]],
            )
        )


def downgrade() -> None:
    # ── 1. Remove base agents ──────────────────────────────────────────────────
    op.execute("DELETE FROM library_agents WHERE is_base = true")

    # ── 2. Drop library agents new columns ─────────────────────────────────────
    op.drop_constraint("fk_library_agents_cloned_from", "library_agents", type_="foreignkey")
    op.drop_column("library_agents", "cloned_from_id")
    op.drop_column("library_agents", "is_base")

    # ── 3. Drop settings UI columns ────────────────────────────────────────────
    op.drop_column("settings", "brand_name")
    op.drop_column("settings", "brand_color")
    op.drop_column("settings", "logo_url")
    op.drop_column("settings", "favicon_url")
    op.drop_column("settings", "default_theme")

    # ── 4. Restore settings LLM columns ────────────────────────────────────────
    op.add_column("settings", sa.Column("llm_presence_penalty", sa.Float(), nullable=True))
    op.add_column("settings", sa.Column("llm_frequency_penalty", sa.Float(), nullable=True))
    op.add_column("settings", sa.Column("llm_top_p", sa.Float(), nullable=True))
    op.add_column("settings", sa.Column("llm_max_tokens", sa.Integer(), nullable=True))
    op.add_column("settings", sa.Column("llm_temperature", sa.Float(), nullable=True))
    op.add_column("settings", sa.Column("llm_base_url", sa.String(), nullable=True))
    op.add_column("settings", sa.Column("llm_api_key", sa.String(), nullable=True))
    op.add_column("settings", sa.Column("llm_model", sa.String(), nullable=True))
    op.add_column("settings", sa.Column("llm_provider", sa.String(), nullable=True))
