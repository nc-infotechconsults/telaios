"""Library router.

Endpoints (all require authentication):

LibraryAgent
  GET    /library/agents
  POST   /library/agents                    (admin)
  GET    /library/agents/by-slug/{slug}
  GET    /library/agents/{agent_id}
  PATCH  /library/agents/{agent_id}         (admin)
  DELETE /library/agents/{agent_id}         (admin)
  POST   /library/agents/{agent_id}/usage

LibraryMCP
  GET    /library/mcp
  POST   /library/mcp                       (admin)
  GET    /library/mcp/{mcp_id}
  PATCH  /library/mcp/{mcp_id}              (admin)
  DELETE /library/mcp/{mcp_id}              (admin)

LibrarySkill
  GET    /library/skills
  POST   /library/skills                    (admin)
  GET    /library/skills/{skill_id}
  PATCH  /library/skills/{skill_id}         (admin)
  DELETE /library/skills/{skill_id}         (admin)
  GET    /library/skills/{skill_id}/download
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal, require_admin
from telaios.db.session import get_session
from telaios.modules.library.schemas import (
    LibraryAgentCreate,
    LibraryAgentPage,
    LibraryAgentPatch,
    LibraryAgentQuery,
    LibraryAgentRead,
    LibraryMcpCreate,
    LibraryMcpPage,
    LibraryMcpPatch,
    LibraryMcpQuery,
    LibraryMcpRead,
    LibrarySkillCreate,
    LibrarySkillPage,
    LibrarySkillPatch,
    LibrarySkillQuery,
    LibrarySkillRead,
)
from telaios.modules.library.service import (
    LibraryAgentService,
    LibraryMcpService,
    LibrarySkillService,
)

library_router = APIRouter(prefix="/library", tags=["library"])

# ── LibraryAgent ──────────────────────────────────────────────────────────────


@library_router.get("/agents", response_model=LibraryAgentPage)
async def list_library_agents(
    _principal: CurrentPrincipal,
    q: str | None = Query(default=None),
    role: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> LibraryAgentPage:
    query = LibraryAgentQuery(q=q, role=role, tags=tags, page=page, limit=limit)
    return await LibraryAgentService(session).list(query)


@library_router.post("/agents", status_code=201, response_model=LibraryAgentRead)
async def create_library_agent(
    body: LibraryAgentCreate,
    principal: Annotated[Principal, Depends(require_admin)],
    session: AsyncSession = Depends(get_session),
) -> LibraryAgentRead:
    return await LibraryAgentService(session).create(body, published_by=str(principal.id))


# NOTE: /by-slug/{slug} must come before /{agent_id} to avoid shadowing.
@library_router.get("/agents/by-slug/{slug}", response_model=LibraryAgentRead)
async def get_library_agent_by_slug(
    slug: str,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> LibraryAgentRead:
    return await LibraryAgentService(session).get_by_slug(slug)


@library_router.get("/agents/{agent_id}", response_model=LibraryAgentRead)
async def get_library_agent(
    agent_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> LibraryAgentRead:
    return await LibraryAgentService(session).get(agent_id)


@library_router.patch("/agents/{agent_id}", response_model=LibraryAgentRead)
async def patch_library_agent(
    agent_id: uuid.UUID,
    body: LibraryAgentPatch,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> LibraryAgentRead:
    return await LibraryAgentService(session).patch(agent_id, body)


@library_router.delete("/agents/{agent_id}", status_code=204)
async def delete_library_agent(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> None:
    await LibraryAgentService(session).delete(agent_id)


@library_router.post("/agents/{agent_id}/usage", status_code=204)
async def increment_library_agent_usage(
    agent_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await LibraryAgentService(session).increment_usage(agent_id)


# ── LibraryMCP ────────────────────────────────────────────────────────────────


@library_router.get("/mcp", response_model=LibraryMcpPage)
async def list_library_mcp(
    _principal: CurrentPrincipal,
    q: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> LibraryMcpPage:
    query = LibraryMcpQuery(q=q, tags=tags, page=page, limit=limit)
    return await LibraryMcpService(session).list(query)


@library_router.post("/mcp", status_code=201, response_model=LibraryMcpRead)
async def create_library_mcp(
    body: LibraryMcpCreate,
    principal: Annotated[Principal, Depends(require_admin)],
    session: AsyncSession = Depends(get_session),
) -> LibraryMcpRead:
    return await LibraryMcpService(session).create(body, published_by=str(principal.id))


@library_router.get("/mcp/{mcp_id}", response_model=LibraryMcpRead)
async def get_library_mcp(
    mcp_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> LibraryMcpRead:
    return await LibraryMcpService(session).get(mcp_id)


@library_router.patch("/mcp/{mcp_id}", response_model=LibraryMcpRead)
async def patch_library_mcp(
    mcp_id: uuid.UUID,
    body: LibraryMcpPatch,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> LibraryMcpRead:
    return await LibraryMcpService(session).patch(mcp_id, body)


@library_router.delete("/mcp/{mcp_id}", status_code=204)
async def delete_library_mcp(
    mcp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> None:
    await LibraryMcpService(session).delete(mcp_id)


# ── LibrarySkill ──────────────────────────────────────────────────────────────


@library_router.get("/skills", response_model=LibrarySkillPage)
async def list_library_skills(
    _principal: CurrentPrincipal,
    q: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> LibrarySkillPage:
    query = LibrarySkillQuery(q=q, tags=tags, page=page, limit=limit)
    return await LibrarySkillService(session).list(query)


@library_router.post("/skills", status_code=201, response_model=LibrarySkillRead)
async def create_library_skill(
    body: LibrarySkillCreate,
    principal: Annotated[Principal, Depends(require_admin)],
    session: AsyncSession = Depends(get_session),
) -> LibrarySkillRead:
    return await LibrarySkillService(session).create(body, published_by=str(principal.id))


# NOTE: /download path must come BEFORE /{skill_id} to avoid shadowing.
@library_router.get("/skills/{skill_id}/download")
async def download_library_skill(
    skill_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> Response:
    zip_bytes, slug = await LibrarySkillService(session).export_as_zip(skill_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'},
    )


@library_router.get("/skills/{skill_id}", response_model=LibrarySkillRead)
async def get_library_skill(
    skill_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> LibrarySkillRead:
    return await LibrarySkillService(session).get(skill_id)


@library_router.patch("/skills/{skill_id}", response_model=LibrarySkillRead)
async def patch_library_skill(
    skill_id: uuid.UUID,
    body: LibrarySkillPatch,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> LibrarySkillRead:
    return await LibrarySkillService(session).patch(skill_id, body)


@library_router.delete("/skills/{skill_id}", status_code=204)
async def delete_library_skill(
    skill_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> None:
    await LibrarySkillService(session).delete(skill_id)
