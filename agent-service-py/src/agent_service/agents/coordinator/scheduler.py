from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Dict, List, Optional, Set
from urllib.parse import urlparse

from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentTask
from agent_service.agents.coordinator.pool import AgentPool
from agent_service.config import config
from agent_service.core.redis import get_redis
from agent_service.crypto import decrypt
from agent_service.services import data_client, sse_manager
from agent_service.services.orchestration_service import OrchestrationService

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"done", "failed", "skipped", "cancelled"})


class Scheduler:
    """
    Topological task scheduler. Reads tasks for a plan, resolves dependencies,
    and dispatches them to agent drivers respecting ``MAX_CONCURRENT_TASKS``.
    """

    def __init__(self, pool: AgentPool) -> None:
        self._pool = pool

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

    def _build_clone_url(self, repo: dict) -> str:
        if repo.get("auth_type") == "token" and repo.get("credentials"):
            token = decrypt(repo["credentials"])
            parsed = urlparse(repo["remote_url"])
            host = parsed.hostname + (f":{parsed.port}" if parsed.port else "")
            return parsed._replace(netloc=f"{token}@{host}").geturl()
        return repo["remote_url"]

    async def _clone_repositories(
        self, project_id: str, repositories: List[dict]
    ) -> Dict[str, str]:
        workspace_map: Dict[str, str] = {}

        for repo in repositories:
            local_path = os.path.join(config.WORKSPACES_ROOT, project_id, repo["name"])
            clone_url = self._build_clone_url(repo)

            self._emit(project_id, {
                "type": "repo_status",
                "repo_id": repo["id"],
                "repo_name": repo["name"],
                "status": "cloning",
            })

            try:
                proc = await asyncio.create_subprocess_exec(
                    "git", "clone", clone_url, local_path,
                    "--branch", repo.get("branch") or "main",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await proc.communicate()
                if proc.returncode != 0:
                    # Repo already cloned — pull
                    pull = await asyncio.create_subprocess_exec(
                        "git", "-C", local_path, "pull",
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await pull.wait()

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
                # Stage and commit any uncommitted changes
                status_proc = await asyncio.create_subprocess_exec(
                    "git", "-C", local_path, "status", "--porcelain",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await status_proc.communicate()
                if stdout.strip():
                    for cmd in [
                        ["git", "-C", local_path, "config", "user.email", "agent@swe-ai.local"],
                        ["git", "-C", local_path, "config", "user.name", "SWE AI Agent"],
                        ["git", "-C", local_path, "add", "."],
                        ["git", "-C", local_path, "commit", "-m", f'chore: agent result for task "{task["title"]}"'],
                    ]:
                        p = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                        await p.wait()

                push_url = self._build_clone_url(repo)
                branch = repo.get("branch") or "main"
                push_proc = await asyncio.create_subprocess_exec(
                    "git", "-C", local_path, "push", push_url, branch,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await push_proc.wait()

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
