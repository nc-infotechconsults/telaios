"""
Unit tests for agent-service data_client.

We mock the underlying httpx.AsyncClient to verify that each helper
calls the correct HTTP method and URL with the expected payload.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
import respx
import httpx


@pytest.fixture(autouse=True)
def reset_data_client():
    """Reset the module-level httpx client so each test starts fresh."""
    import agent_service.services.data_client as dc
    dc._client = None
    yield
    dc._client = None


@pytest.mark.asyncio
async def test_get_project(respx_mock):
    respx_mock.get("http://localhost:3000/projects/p1").mock(
        return_value=httpx.Response(200, json={"id": "p1", "name": "Test"})
    )
    from agent_service.services import data_client

    result = await data_client.get_project("p1")
    assert result["id"] == "p1"


@pytest.mark.asyncio
async def test_get_settings(respx_mock):
    respx_mock.get("http://localhost:3000/settings/raw").mock(
        return_value=httpx.Response(200, json={"llm_provider": "openai", "llm_model": "gpt-4o"})
    )
    from agent_service.services import data_client

    result = await data_client.get_settings()
    assert result["llm_provider"] == "openai"


@pytest.mark.asyncio
async def test_get_plan(respx_mock):
    respx_mock.get("http://localhost:3000/plans/plan1").mock(
        return_value=httpx.Response(200, json={"id": "plan1", "status": "confirmed"})
    )
    from agent_service.services import data_client

    result = await data_client.get_plan("plan1")
    assert result["status"] == "confirmed"


@pytest.mark.asyncio
async def test_get_project_plans(respx_mock):
    respx_mock.get("http://localhost:3000/plans?project_id=p1").mock(
        return_value=httpx.Response(200, json=[{"id": "plan1", "status": "draft"}])
    )
    from agent_service.services import data_client

    result = await data_client.get_project_plans("p1")
    assert len(result) == 1
    assert result[0]["id"] == "plan1"


@pytest.mark.asyncio
async def test_get_project_repositories(respx_mock):
    respx_mock.get("http://localhost:3000/projects/p1/repositories").mock(
        return_value=httpx.Response(200, json=[{"id": "r1", "name": "repo1"}])
    )
    from agent_service.services import data_client

    result = await data_client.get_project_repositories("p1")
    assert result[0]["name"] == "repo1"


@pytest.mark.asyncio
async def test_get_plan_tasks(respx_mock):
    respx_mock.get("http://localhost:3000/tasks?plan_id=plan1").mock(
        return_value=httpx.Response(200, json=[{"id": "t1", "title": "Task 1"}])
    )
    from agent_service.services import data_client

    result = await data_client.get_plan_tasks("plan1")
    assert result[0]["id"] == "t1"


@pytest.mark.asyncio
async def test_create_plan(respx_mock):
    body = {"project_id": "p1", "title": "New plan"}
    respx_mock.post("http://localhost:3000/plans").mock(
        return_value=httpx.Response(201, json={"id": "plan2", **body})
    )
    from agent_service.services import data_client

    result = await data_client.create_plan(body)
    assert result["id"] == "plan2"


@pytest.mark.asyncio
async def test_update_plan(respx_mock):
    respx_mock.patch("http://localhost:3000/plans/plan1").mock(
        return_value=httpx.Response(200, json={"id": "plan1", "status": "executing"})
    )
    from agent_service.services import data_client

    result = await data_client.update_plan("plan1", {"status": "executing"})
    assert result["status"] == "executing"


@pytest.mark.asyncio
async def test_create_task(respx_mock):
    body = {"plan_id": "plan1", "title": "Code task"}
    respx_mock.post("http://localhost:3000/tasks").mock(
        return_value=httpx.Response(201, json={"id": "t1", **body, "status": "pending"})
    )
    from agent_service.services import data_client

    result = await data_client.create_task(body)
    assert result["id"] == "t1"


@pytest.mark.asyncio
async def test_update_task(respx_mock):
    respx_mock.patch("http://localhost:3000/tasks/t1").mock(
        return_value=httpx.Response(200, json={"id": "t1", "status": "in_progress"})
    )
    from agent_service.services import data_client

    result = await data_client.update_task("t1", {"status": "in_progress"})
    assert result["status"] == "in_progress"


@pytest.mark.asyncio
async def test_delete_tasks_by_plan(respx_mock):
    respx_mock.delete("http://localhost:3000/plans/plan1/tasks").mock(
        return_value=httpx.Response(200, json={"deleted": 3})
    )
    from agent_service.services import data_client

    result = await data_client.delete_tasks_by_plan("plan1")
    assert result["deleted"] == 3


@pytest.mark.asyncio
async def test_save_message(respx_mock):
    body = {"project_id": "p1", "role": "user", "content": "Hello"}
    respx_mock.post("http://localhost:3000/messages").mock(
        return_value=httpx.Response(201, json={"id": "m1", **body})
    )
    from agent_service.services import data_client

    result = await data_client.save_message(body)
    assert result["id"] == "m1"


@pytest.mark.asyncio
async def test_update_repository_status(respx_mock):
    respx_mock.patch("http://localhost:3000/repositories/r1").mock(
        return_value=httpx.Response(200, json={"id": "r1", "status": "ready"})
    )
    from agent_service.services import data_client

    result = await data_client.update_repository_status("r1", {"status": "ready"})
    assert result["status"] == "ready"


@pytest.mark.asyncio
async def test_start_plan_execution(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/plans/plan1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client

    await data_client.start_plan_execution("plan1")
    assert respx_mock.calls.last.request.url == "http://localhost:3000/internal/plans/plan1/status"
    import json
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["status"] == "executing"


@pytest.mark.asyncio
async def test_complete_plan_execution(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/plans/plan1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    await data_client.complete_plan_execution("plan1")
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["status"] == "completed"


@pytest.mark.asyncio
async def test_fail_plan_execution_with_reason(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/plans/plan1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    await data_client.fail_plan_execution("plan1", "Out of memory")
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["status"] == "failed"
    assert sent_body["failure_reason"] == "Out of memory"


@pytest.mark.asyncio
async def test_fail_plan_execution_no_reason(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/plans/plan1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    await data_client.fail_plan_execution("plan1")
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["failure_reason"] is None


@pytest.mark.asyncio
async def test_skip_dependent_tasks(respx_mock):
    respx_mock.post("http://localhost:3000/internal/tasks/t1/skip-dependents").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )
    from agent_service.services import data_client

    await data_client.skip_dependent_tasks("t1")
    assert respx_mock.calls.last.request.url == "http://localhost:3000/internal/tasks/t1/skip-dependents"


@pytest.mark.asyncio
async def test_cancel_plan_tasks(respx_mock):
    respx_mock.post("http://localhost:3000/internal/plans/plan1/cancel-tasks").mock(
        return_value=httpx.Response(200, json={"cancelled": 5})
    )
    from agent_service.services import data_client

    result = await data_client.cancel_plan_tasks("plan1")
    assert result["cancelled"] == 5


@pytest.mark.asyncio
async def test_create_task_artifacts(respx_mock):
    respx_mock.post("http://localhost:3000/internal/tasks/t1/artifacts").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    artifacts = [
        {"type": "log", "title": "Exec Log", "content": "step 1"},
        {"type": "diff", "title": "Git Diff", "content": "diff --git a/f b/f"},
    ]
    await data_client.create_task_artifacts("t1", artifacts)
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert len(sent_body["artifacts"]) == 2


@pytest.mark.asyncio
async def test_get_document(respx_mock):
    doc_payload = {
        "id": "doc1",
        "project_id": "p1",
        "name": "report.pdf",
        "file_type": "pdf",
        "mime_type": "application/pdf",
        "s3_key": "projects/p1/documents/doc1/report.pdf",
        "size_bytes": 1024,
        "status": "ready",
    }
    respx_mock.get("http://localhost:3000/projects/p1/documents/doc1").mock(
        return_value=httpx.Response(200, json=doc_payload)
    )
    from agent_service.services import data_client

    result = await data_client.get_document("p1", "doc1")
    assert result["id"] == "doc1"
    assert result["name"] == "report.pdf"
    assert result["status"] == "ready"


@pytest.mark.asyncio
async def test_get_document_not_found(respx_mock):
    respx_mock.get("http://localhost:3000/projects/p1/documents/missing").mock(
        return_value=httpx.Response(404, json={"error": "Not found"})
    )
    from agent_service.services import data_client

    with pytest.raises(Exception):
        await data_client.get_document("p1", "missing")


@pytest.mark.asyncio
async def test_update_document_status(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/documents/doc1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    await data_client.update_document_status("doc1", "processed")
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["status"] == "processed"
    assert sent_body["error_message"] is None


@pytest.mark.asyncio
async def test_update_document_status_with_error(respx_mock):
    respx_mock.patch("http://localhost:3000/internal/documents/doc1/status").mock(
        return_value=httpx.Response(200, json={})
    )
    from agent_service.services import data_client
    import json

    await data_client.update_document_status("doc1", "error", "Parse failed")
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["error_message"] == "Parse failed"


@pytest.mark.asyncio
async def test_store_document_chunks(respx_mock):
    respx_mock.post("http://localhost:3000/internal/documents/doc1/chunks").mock(
        return_value=httpx.Response(200, json={"stored": 2})
    )
    from agent_service.services import data_client
    import json

    chunks = [
        {"chunk_index": 0, "content": "chunk 0", "embedding": [0.1, 0.2]},
        {"chunk_index": 1, "content": "chunk 1", "embedding": [0.3, 0.4]},
    ]
    await data_client.store_document_chunks("doc1", chunks)
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert len(sent_body["chunks"]) == 2


@pytest.mark.asyncio
async def test_search_document_chunks(respx_mock):
    respx_mock.post("http://localhost:3000/internal/documents/search").mock(
        return_value=httpx.Response(200, json=[{"id": "c1", "content": "result", "similarity": 0.95}])
    )
    from agent_service.services import data_client
    import json

    result = await data_client.search_document_chunks("p1", [0.1, 0.2], 3)
    assert len(result) == 1
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["project_id"] == "p1"
    assert sent_body["limit"] == 3


@pytest.mark.asyncio
async def test_search_document_chunks_default_limit(respx_mock):
    respx_mock.post("http://localhost:3000/internal/documents/search").mock(
        return_value=httpx.Response(200, json=[])
    )
    from agent_service.services import data_client
    import json

    await data_client.search_document_chunks("p1", [0.1])
    sent_body = json.loads(respx_mock.calls.last.request.content)
    assert sent_body["limit"] == 5


@pytest.mark.asyncio
async def test_error_propagation(respx_mock):
    respx_mock.get("http://localhost:3000/projects/p1").mock(
        return_value=httpx.Response(500, json={"error": "Internal server error"})
    )
    from agent_service.services import data_client

    with pytest.raises(httpx.HTTPStatusError):
        await data_client.get_project("p1")
