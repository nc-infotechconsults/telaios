"""add_designer_agent_to_design_sessions

Revision ID: e1f2a3b4c5d6
Revises: d9e4a17dca31
Create Date: 2026-05-14 12:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import json

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d9e4a17dca31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ── Default Designer Agent configuration ─────────────────────────────────

_DESIGNER_AGENT_ID = "11111111-1111-1111-1111-111111111111"

_DESIGNER_SYSTEM_PROMPT = (
    "You are an expert UI/UX designer. Your task is to generate high-quality, "
    "responsive, and accessible HTML/CSS/JavaScript UI artifacts based on user requests.\n\n"
    "Rules:\n"
    "1. Return ONLY valid JSON with keys: assistant_message, title, description, html, css, js, rationale\n"
    "2. The 'html' field must contain semantic body markup only (no html/head/body tags)\n"
    "3. The 'css' field should contain plain CSS that styles the markup\n"
    "4. The 'js' field is optional and should contain plain JavaScript\n"
    "5. The 'assistant_message' should briefly explain the design choices (max 80 words)\n"
    "6. The 'rationale' should explain the design reasoning\n"
    "7. Prioritize responsive layout, accessibility, and modern design patterns\n"
    "8. Do NOT use markdown fences or explanatory text outside the JSON\n"
    "9. Ensure all interactive elements are keyboard-accessible\n"
    "10. Use CSS custom properties for theming when appropriate"
)

_DESIGNER_STRUCTURED_OUTPUT = {
    "title": "DesignArtifact",
    "type": "object",
    "properties": {
        "assistant_message": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "html": {"type": "string"},
        "css": {"type": "string"},
        "js": {"type": "string"},
        "rationale": {"type": "string"},
    },
    "required": ["title", "html"],
}


def upgrade() -> None:
    # ── Add designer_agent_id to design_sessions ────────────────────────
    op.add_column(
        "design_sessions",
        sa.Column("designer_agent_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_design_sessions_designer_agent",
        "design_sessions",
        "library_agents",
        ["designer_agent_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── Seed default Designer agent ──────────────────────────────────────
    _structured_output_json = json.dumps(_DESIGNER_STRUCTURED_OUTPUT).replace("'", "''")
    op.execute(
        sa.text(
            f"""
            INSERT INTO library_agents (
                id, name, slug, description, agent_type, role,
                system_prompt, system_prompt_mode,
                llm_provider, llm_model, llm_temperature, llm_max_tokens,
                llm_api_key,
                sub_agents, mcp_servers, skills, structured_output,
                tags, is_base, cloned_from_id, published_by,
                usage_count, version,
                created_at, updated_at, deleted_at
            ) VALUES (
                '{_DESIGNER_AGENT_ID}'::uuid, 'Designer', 'designer',
                'Expert UI/UX designer agent for generating responsive, accessible web UI artifacts',
                'system', 'designer',
                :system_prompt, 'override',
                NULL, NULL, 0.7, 4096,
                NULL,
                '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{_structured_output_json}'::jsonb,
                '["design", "ui", "ux"]'::jsonb, false, NULL, 'system',
                0, '1.0.0',
                NOW(), NOW(), NULL
            )
            ON CONFLICT (id) DO NOTHING
            """
        ).bindparams(
            system_prompt=_DESIGNER_SYSTEM_PROMPT,
        )
    )


def downgrade() -> None:
    # ── Remove Designer agent seed ──────────────────────────────────────
    op.execute(
        sa.text(f"DELETE FROM library_agents WHERE id = '{_DESIGNER_AGENT_ID}'::uuid")
    )

    # ── Remove designer_agent_id from design_sessions ──────────────────
    op.drop_constraint("fk_design_sessions_designer_agent", "design_sessions", type_="foreignkey")
    op.drop_column("design_sessions", "designer_agent_id")
