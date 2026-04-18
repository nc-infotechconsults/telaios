from __future__ import annotations

import logging

from agent_service.agents.coordinator.pool import AgentPool
from agent_service.agents.coordinator.scheduler import Scheduler
from agent_service.agents.register import register_all_agents
from agent_service.services import data_client

logger = logging.getLogger(__name__)


async def start_execution(project_id: str, plan_id: str) -> None:
    """
    Bootstrap agent execution for a confirmed plan.

    1. Register all agent types
    2. Load agent profiles for this project
    3. Load project agents (role → profile mapping)
    4. Initialise AgentPool with driver instances
    5. Run the Scheduler
    """
    logger.info("[execution_service] Starting execution for plan %s (project %s)", plan_id, project_id)

    # 1. Register agent types
    register_all_agents()

    # 2. Load settings + profiles
    try:
        settings = await data_client.get_settings()
        profiles = await data_client.get_agent_profiles()
        project_agents = await data_client.get_project_agents(project_id)
        project = await data_client.get_project(project_id)
    except Exception as err:
        logger.error("[execution_service] Failed to load configuration: %s", err)
        raise

    # 3. Build pool
    pool = AgentPool()
    pool.initialize(profiles)
    pool.register_role_drivers(
        project_agents,
        project_ctx={"id": project_id, "name": project.get("name", project_id)},
    )

    # 4. Run scheduler
    scheduler = Scheduler(pool)
    try:
        await scheduler.run(project_id, plan_id)
    except Exception as err:
        logger.error("[execution_service] Scheduler raised an error for plan %s: %s", plan_id, err)
        raise
