"""Analytics HTTP router.

GET /analytics/projects/:projectId       — project task + agent analytics
GET /analytics/projects/:projectId/docs  — project document analytics
GET /analytics/org                       — org-wide project summaries
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import Principal, current_principal, require_admin
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.analytics.schemas import (
    DocumentAnalytics,
    OrgProjectSummary,
    ProjectAnalytics,
)
from telaios.modules.analytics.service import AnalyticsService, parse_period_days

analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])


@analytics_router.get(
    "/projects/{project_id}",
    response_model=ProjectAnalytics,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_project_analytics(
    project_id: uuid.UUID,
    period: str | None = Query(default=None, description="7d | 30d | 90d"),
    session: AsyncSession = Depends(get_session),
) -> ProjectAnalytics:
    days = parse_period_days(period)
    return await AnalyticsService(session).get_project_analytics(project_id, days)


@analytics_router.get(
    "/projects/{project_id}/docs",
    response_model=DocumentAnalytics,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_project_document_analytics(
    project_id: uuid.UUID,
    period: str | None = Query(default=None, description="7d | 30d | 90d"),
    session: AsyncSession = Depends(get_session),
) -> DocumentAnalytics:
    days = parse_period_days(period)
    return await AnalyticsService(session).get_project_document_analytics(project_id, days)


@analytics_router.get(
    "/org",
    response_model=list[OrgProjectSummary],
)
async def get_org_analytics(
    principal: Principal = Depends(current_principal),
    session: AsyncSession = Depends(get_session),
) -> list[OrgProjectSummary]:
    is_admin = principal.system_role == "admin"
    return await AnalyticsService(session).get_org_analytics(uuid.UUID(principal.id), is_admin)


# Org-analytics also available to admins at /analytics/org/all (alias)
@analytics_router.get(
    "/org/all",
    response_model=list[OrgProjectSummary],
    dependencies=[Depends(require_admin)],
)
async def get_org_analytics_admin(
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(current_principal),
) -> list[OrgProjectSummary]:
    return await AnalyticsService(session).get_org_analytics(uuid.UUID(principal.id), is_admin=True)
