from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agent_service.services import data_client, sse_manager

from .state import PlannedTask, PlannerState


async def _stream_message_chunks(plan_id: str, text: str) -> None:
    chunks = re.findall(r"\S+\s*", text) or [text]
    for chunk in chunks:
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": chunk})
        await asyncio.sleep(0.018)


async def _save_draft_tasks(
    plan_id: str, planned_tasks: List[PlannedTask]
) -> List[Dict[str, Any]]:
    """
    Persist draft tasks to the DB, replacing any existing ones.

    Two-pass strategy:
      Pass 1 — create all tasks without dependencies to obtain their real UUIDs.
      Pass 2 — patch tasks that have dependencies, resolving index references to UUIDs.
    """
    await data_client.delete_tasks_by_plan(plan_id)

    saved = await asyncio.gather(
        *[
            data_client.create_task({
                "plan_id": plan_id,
                "title": t.title,
                "description": t.description or "",
                "type": t.type or "general",
                "status": "pending",
                "execution_order": (t.execution_order if t.execution_order is not None else i),
                "repository_ids": t.repository_ids or [],
            })
            for i, t in enumerate(planned_tasks)
        ]
    )

    id_by_index = [t["id"] for t in saved]
    await asyncio.gather(
        *[
            data_client.update_task(
                saved[i]["id"],
                {
                    "depends_on_task_ids": [
                        id_by_index[idx]
                        for idx in (t.depends_on_task_indices or [])
                        if 0 <= idx < len(id_by_index)
                    ]
                },
            )
            for i, t in enumerate(planned_tasks)
            if t.depends_on_task_indices
        ]
    )

    return await data_client.get_plan_tasks(plan_id)


def _build_plan_payload(
    plan_id: str, state: PlannerState, saved_tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    return {
        "id": plan_id,
        "project_id": state["project_id"],
        "title": state.get("plan_title"),
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tasks": saved_tasks,
    }


def _parse_planner_response(text: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        if not isinstance(parsed.get("message"), str):
            return None
        return {
            "message": parsed["message"],
            "ready_for_plan": bool(parsed.get("ready_for_plan", False)),
            "plan": parsed.get("plan"),
        }
    except Exception:
        return None
