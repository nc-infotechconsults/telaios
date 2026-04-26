from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Dict, List, Optional, Set

from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentTask
from agent_service.agents.coordinator.git_ops import (
    build_clone_url,
    clone_or_pull,
    commit_and_push,
    git_env,
    is_safe_repo_name,
)
from agent_service.agents.coordinator.pool import AgentPool
from agent_service.config import config
from agent_service.core.redis import get_redis
from agent_service.services import data_client, sse_manager
from agent_service.services.orchestration_service import OrchestrationService

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"done", "failed", "skipped", "cancelled"})


class Scheduler:
    """
    Topological task scheduler. Reads tasks for a plan, resolves dependencies,
    and dispatches them to agent drivers respecting ``MAX_CONCURRENT_TASKS``.
    """

    def __init__(self, pool: AgentPool, project_agents: Optional[List[dict]] = None) -> None:
        self._pool = pool
        # Map from project agent ID → library_agent_id (for usage_count increment).
        self._library_agent_id_by_profile: Dict[str, str] = {
            pa["id"]: pa["library_agent_id"]
            for pa in (project_agents or [])
            if pa.get("library_agent_id")
        }

    async def run(self, project_id: str, plan_id: str) -> None:
        await data_client.update_plan(plan_id, {"status": "executing"})
        self._emit(project_id, {"type": "plan_executing", "plan_id": plan_id})

        try:
            await self._run_internal(project_id, plan_id)
            await data_client.complete_plan_execution(plan_id)
            self._emit(project_id, {"type": "plan_completed", "plan_id": plan_id})
        except Exception as err:
            reason = str(err)
            try:
                await data_client.fail_plan_execution(plan_id, reason)
            except Exception:
                pass
            self._emit(project_id, {"type": "plan_failed", "plan_id": plan_id, "error": reason})
            raise

    async def _run_internal(self, project_id: str, plan_id: str) -> None:
        repositories = await data_client.get_project_repositories(project_id)
        tasks = await data_client.get_plan_tasks(plan_id)

        workspace_map = await self._clone_repositories(project_id, repositories)
        repo_by_id = {r["id"]: r for r in repositories}

        terminal_ids: Set[str] = set()
        completed_ids: Set[str] = set()
        in_flight_ids: Set[str] = set()

        for t in tasks:
            if t["status"] in TERMINAL_STATUSES:
                terminal_ids.add(t["id"])
            if t["status"] == "done":
                completed_ids.add(t["id"])

        max_concurrent = config.MAX_CONCURRENT_TASKS

        while len(terminal_ids) < len(tasks):
            ready = [
                t for t in tasks
                if t["id"] not in terminal_ids
                and t["id"] not in in_flight_ids
                and all(dep in completed_ids for dep in t.get("depends_on_task_ids", []))
            ]

            if not ready:
                if not in_flight_ids:
                    break  # deadlock / all done
                await asyncio.sleep(1.0)
                continue

            slots = max(0, max_concurrent - len(in_flight_ids))
            if slots == 0:
                await asyncio.sleep(1.0)
                continue

            batch = ready[:slots]
            await asyncio.gather(
                *[
                    self._dispatch_task(
                        project_id, plan_id, task, tasks,
                        workspace_map, repo_by_id,
                        terminal_ids, completed_ids, in_flight_ids,
                    )
                    for task in batch
                ],
                return_exceptions=True,
            )

    # ── Repository management ─────────────────────────────────────────────────

    async def _clone_repositories(
        self, project_id: str, repositories: List[dict]
    ) -> Dict[str, str]:
        workspace_map: Dict[str, str] = {}

        for repo in repositories:
            repo_name = repo["name"]
            if not is_safe_repo_name(repo_name):
                logger.error(
                    "[Scheduler] Rejecting repository with unsafe name %r — contains path traversal characters",
                    repo_name,
                )
                self._emit(project_id, {
                    "type": "repo_status",
                    "repo_id": repo["id"],
                    "repo_name": repo_name,
                    "status": "error",
                    "message": "Repository name contains unsafe characters",
                })
                continue

            local_path = os.path.join(config.WORKSPACES_ROOT, project_id, repo_name)
            self._emit(project_id, {
                "type": "repo_status",
                "repo_id": repo["id"],
                "repo_name": repo["name"],
                "status": "cloning",
            })

            try:
                await clone_or_pull(
                    clone_url=build_clone_url(repo),
                    local_path=local_path,
                    branch=repo.get("branch") or "main",
                    env=git_env(repo),
                )
                await data_client.update_repository_status(
                    repo["id"], {"status": "ready", "local_path": local_path}
                )
                workspace_map[repo["id"]] = local_path
                self._emit(project_id, {
                    "type": "repo_status",
                    "repo_id": repo["id"],
                    "repo_name": repo["name"],
                    "status": "ready",
                })
            except Exception as err:
                await data_client.update_repository_status(
                    repo["id"], {"status": "error", "error_message": str(err)}
                )
                self._emit(project_id, {
                    "type": "repo_status",
                    "repo_id": repo["id"],
                    "repo_name": repo["name"],
                    "status": "error",
                    "message": str(err),
                })

        return workspace_map

    # ── Git push ──────────────────────────────────────────────────────────────

    async def _push_workspaces(
        self, project_id: str, task: dict, workspace_map: Dict[str, str], repo_by_id: Dict[str, dict]
    ) -> None:
        for repo_id in task.get("repository_ids", []):
            local_path = workspace_map.get(repo_id)
            repo = repo_by_id.get(repo_id)
            if not local_path or not repo:
                continue
            try:
                await commit_and_push(
                    local_path=local_path,
                    branch=repo.get("branch") or "main",
                    push_url=build_clone_url(repo),
                    env=git_env(repo),
                    commit_msg=f'chore: agent result for task "{task["title"]}"',
                )
                self._emit(project_id, {
                    "type": "repo_status",
                    "repo_id": repo["id"],
                    "repo_name": repo["name"],
                    "status": "ready",
                    "message": "Changes pushed to remote",
                })
            except Exception as err:
                logger.error("[Scheduler] Failed to push repo %s: %s", repo["name"], err)
                self._emit(project_id, {
                    "type": "repo_status",
                    "repo_id": repo["id"],
                    "repo_name": repo["name"],
                    "status": "ready",
                    "message": f"Push failed (non-fatal): {err}",
                })

    # ── Task dispatch ─────────────────────────────────────────────────────────

    async def _dispatch_task(
        self,
        project_id: str,
        plan_id: str,
        task: dict,
        all_tasks: List[dict],
        workspace_map: Dict[str, str],
        repo_by_id: Dict[str, dict],
        terminal_ids: Set[str],
        completed_ids: Set[str],
        in_flight_ids: Set[str],
    ) -> None:
        in_flight_ids.add(task["id"])
        try:
            await self._dispatch_task_inner(
                project_id, plan_id, task, all_tasks,
                workspace_map, repo_by_id,
                terminal_ids, completed_ids, in_flight_ids,
            )
        except Exception as err:
            logger.error("[Scheduler] Unexpected error in dispatch for task %s: %s", task["id"], err)
            in_flight_ids.discard(task["id"])
            terminal_ids.add(task["id"])
            try:
                await data_client.update_task(task["id"], {
                    "status": "failed",
                    "result": f"Scheduler internal error: {err}",
                    "completed_at": _now(),
                })
            except Exception:
                pass
            self._emit(project_id, {"type": "task_status", "task_id": task["id"], "status": "failed"})

    async def _dispatch_task_inner(
        self,
        project_id: str,
        plan_id: str,
        task: dict,
        all_tasks: List[dict],
        workspace_map: Dict[str, str],
        repo_by_id: Dict[str, dict],
        terminal_ids: Set[str],
        completed_ids: Set[str],
        in_flight_ids: Set[str],
    ) -> None:
        await data_client.update_task(task["id"], {"status": "in_progress"})
        self._emit(project_id, {
            "type": "task_status",
            "task_id": task["id"],
            "status": "in_progress",
            "agent_profile_id": task.get("agent_profile_id"),
        })

        workspaces: Dict[str, str] = {}
        for repo_id in task.get("repository_ids", []):
            local = workspace_map.get(repo_id)
            name = repo_by_id.get(repo_id, {}).get("name", repo_id)
            if local:
                workspaces[name] = local
        if not workspaces and workspace_map:
            workspaces["default"] = next(iter(workspace_map.values()))

        agent_task = AgentTask(
            id=task["id"],
            title=task["title"],
            description=task["description"],
            type=task["type"],
            agent_profile_id=task.get("agent_profile_id"),
        )

        driver = (
            self._pool.get_driver_by_role(task["type"])
            or (self._pool.get_driver(task["agent_profile_id"]) if task.get("agent_profile_id") else None)
        )

        self._emit(project_id, {
            "type": "agent_started",
            "task_id": task["id"],
            "agent_role": task["type"],
            "agent_profile_id": task.get("agent_profile_id"),
        })

        started_at = _now()

        if not driver:
            logger.warning("[Scheduler] No driver found for task %s type=%s", task["id"], task["type"])
            await data_client.update_task(task["id"], {
                "status": "failed",
                "result": "No driver found for task type or profile",
                "started_at": started_at,
                "completed_at": _now(),
            })
            self._emit(project_id, {"type": "task_status", "task_id": task["id"], "status": "failed"})
            in_flight_ids.discard(task["id"])
            terminal_ids.add(task["id"])
            return

        logger.info("[Scheduler] Executing task %s (%s) with driver", task["id"], task["title"])
        result = await driver.execute(agent_task, workspaces)
        logger.info("[Scheduler] Task %s finished: success=%s", task["id"], result.success)

        completed_at = _now()

        # Capture git diff
        diff_artifacts: list = []
        diff_idx = 0
        for repo_id in task.get("repository_ids", []):
            local = workspace_map.get(repo_id)
            repo_name = repo_by_id.get(repo_id, {}).get("name", repo_id)
            if not local:
                continue
            try:
                proc = await asyncio.create_subprocess_exec(
                    "git", "-C", local, "diff", "HEAD",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await proc.communicate()
                diff = stdout.decode(errors="replace").strip()
                if diff:
                    diff_artifacts.append({
                        "type": "diff",
                        "title": f"Git diff — {repo_name}",
                        "content": diff,
                        "content_type": "text/x-diff",
                        "sort_order": diff_idx,
                    })
                    diff_idx += 1
            except Exception:
                pass

        new_status = "done" if result.success else "failed"
        await data_client.update_task(task["id"], {
            "status": new_status,
            "result": result.output or result.error,
            "started_at": started_at,
            "completed_at": completed_at,
        })

        all_artifacts = diff_artifacts + [
            {
                "type": a.type,
                "title": a.title,
                "content": a.content,
                "content_type": a.content_type,
                "metadata": a.metadata,
                "sort_order": len(diff_artifacts) + i,
            }
            for i, a in enumerate(result.artifacts or [])
        ]
        if all_artifacts:
            try:
                await data_client.create_task_artifacts(task["id"], all_artifacts)
            except Exception as err:
                logger.error("[Scheduler] create_task_artifacts failed for task %s: %s", task["id"], err)

        self._emit(project_id, {
            "type": "task_status",
            "task_id": task["id"],
            "status": new_status,
            "agent_profile_id": task.get("agent_profile_id"),
        })

        if result.success:
            self._emit(project_id, {"type": "agent_completed", "task_id": task["id"], "agent_role": task["type"]})
            await self._push_workspaces(project_id, task, workspace_map, repo_by_id)
        else:
            self._emit(project_id, {
                "type": "agent_failed",
                "task_id": task["id"],
                "agent_role": task["type"],
                "error": result.error,
            })

        in_flight_ids.discard(task["id"])
        terminal_ids.add(task["id"])

        if result.success:
            completed_ids.add(task["id"])
            # Increment usage_count for the source library agent (best-effort).
            profile_id = task.get("agent_profile_id")
            if profile_id:
                lib_id = self._library_agent_id_by_profile.get(profile_id)
                if lib_id:
                    try:
                        await data_client.increment_library_agent_usage(lib_id)
                    except Exception as err:
                        logger.warning("[Scheduler] increment_library_agent_usage failed: %s", err)
        else:
            dependents = self._get_transitive_dependents(task["id"], all_tasks, terminal_ids)
            if dependents:
                try:
                    await data_client.skip_dependent_tasks(task["id"])
                except Exception as err:
                    logger.error("[Scheduler] skip_dependent_tasks failed: %s", err)
                for dep_id in dependents:
                    terminal_ids.add(dep_id)
                    self._emit(project_id, {"type": "task_status", "task_id": dep_id, "status": "skipped"})

        redis = get_redis()
        await redis.publish(
            f"project:{project_id}:task",
            json.dumps({"task_id": task["id"], "status": new_status}),
        )

        OrchestrationService.get_instance().notify_task_complete(plan_id, task["id"], result.success)

    def _get_transitive_dependents(
        self, task_id: str, tasks: List[dict], exclude_ids: Set[str]
    ) -> List[str]:
        result: list[str] = []
        visited: Set[str] = set()

        def traverse(tid: str) -> None:
            direct = [t for t in tasks if tid in t.get("depends_on_task_ids", []) and t["id"] not in exclude_ids]
            for dep in direct:
                if dep["id"] not in visited:
                    visited.add(dep["id"])
                    result.append(dep["id"])
                    traverse(dep["id"])

        traverse(task_id)
        return result

    def _emit(self, project_id: str, event: dict) -> None:
        sse_manager.broadcast(project_id, event)
        redis = get_redis()
        asyncio.ensure_future(
            redis.publish(f"project:{project_id}:events", json.dumps(event))
        )


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
