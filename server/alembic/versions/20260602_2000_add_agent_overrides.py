"""add_agent_overrides

Revision ID: c1d2e3f4a5b6
Revises: ad54d9e31b91
Create Date: 2026-06-02 20:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: str | None = 'ad54d9e31b91'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add columns to library_agents
    op.add_column('library_agents', sa.Column('dispatch', sa.String(), nullable=True))
    op.add_column('library_agents', sa.Column('llm_top_p', sa.Float(), nullable=True))
    op.add_column('library_agents', sa.Column('llm_frequency_penalty', sa.Float(), nullable=True))
    op.add_column('library_agents', sa.Column('llm_presence_penalty', sa.Float(), nullable=True))

    # Create agent_overrides table
    op.create_table(
        'agent_overrides',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('base_profile_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('system_prompt_mode', sa.String(), nullable=True),
        sa.Column('llm_provider', sa.String(), nullable=True),
        sa.Column('llm_model', sa.String(), nullable=True),
        sa.Column('llm_temperature', sa.Float(), nullable=True),
        sa.Column('llm_max_tokens', sa.Integer(), nullable=True),
        sa.Column('llm_top_p', sa.Float(), nullable=True),
        sa.Column('llm_frequency_penalty', sa.Float(), nullable=True),
        sa.Column('llm_presence_penalty', sa.Float(), nullable=True),
        sa.Column('mcp_servers', postgresql.JSONB(), nullable=True),
        sa.Column('skills', postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(['base_profile_id'], ['library_agents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Partial unique indexes: one override per base_profile per scope
    op.create_index(
        "uq_agent_override_workspace_scope",
        "agent_overrides",
        ["base_profile_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "uq_agent_override_project_scope",
        "agent_overrides",
        ["base_profile_id", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_agent_override_project_scope", table_name="agent_overrides")
    op.drop_index("uq_agent_override_workspace_scope", table_name="agent_overrides")
    op.drop_table('agent_overrides')
    op.drop_column('library_agents', 'llm_presence_penalty')
    op.drop_column('library_agents', 'llm_frequency_penalty')
    op.drop_column('library_agents', 'llm_top_p')
    op.drop_column('library_agents', 'dispatch')
