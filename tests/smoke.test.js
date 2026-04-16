/**
 * Smoke / Integration tests for SWE AI Platform
 *
 * Requires all services to be running:
 *   docker compose up   (or npm run dev in each service)
 *
 * Usage:
 *   npm test
 *   DATA_API_URL=http://localhost:3000 AGENT_URL=http://localhost:8000 npm test
 *
 * Auth: all data-api routes (except /health and /auth) require authentication.
 * The INTERNAL_API_KEY is used as a Bearer token — treated as admin.
 */

import axios from "axios";
import http from "http";
import https from "https";

const DATA_API = process.env.DATA_API_URL ?? "http://localhost:3000";
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "change_me_internal_api_key";
const VERBOSE = process.env.VERBOSE === "1";

// Authenticated client — all data-api routes require Bearer auth.
const api = axios.create({
  baseURL: DATA_API,
  headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
});

// ─── Tiny test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function log(...args) {
  if (VERBOSE) console.log(...args);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failures.push({ name, error: err.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(`${label ?? "Value"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Data API tests ───────────────────────────────────────────────────────────

async function runDataApiTests() {
  console.log("\n── Data API ──────────────────────────────────────────────────");

  let projectId, repoId, profileId, planId, taskId;

  await test("GET /health returns ok", async () => {
    // Health is unauthenticated
    const { data } = await axios.get(`${DATA_API}/health`);
    assertEqual(data.status, "ok", "health status");
  });

  // Settings
  await test("GET /settings returns settings object", async () => {
    const { data } = await api.get("/settings");
    assert(typeof data === "object", "settings is object");
    assert("llm_provider" in data, "has llm_provider");
  });

  await test("PATCH /settings updates provider", async () => {
    const { data } = await api.patch("/settings", {
      llm_provider: "openai",
      llm_model: "gpt-4o",
    });
    assertEqual(data.llm_provider, "openai", "provider");
    assertEqual(data.llm_model, "gpt-4o", "model");
  });

  // Projects
  await test("POST /projects creates project", async () => {
    const { data, status } = await api.post("/projects", {
      name: "Smoke Test Project",
      description: "Created by integration tests",
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
    assertEqual(data.status, "planning", "initial status");
    projectId = data.id;
    log("  → projectId:", projectId);
  });

  await test("GET /projects returns list with new project", async () => {
    const { data } = await api.get("/projects");
    assert(Array.isArray(data), "is array");
    assert(data.some((p) => p.id === projectId), "contains created project");
  });

  await test("GET /projects/:id returns project", async () => {
    const { data } = await api.get(`/projects/${projectId}`);
    assertEqual(data.id, projectId, "id");
  });

  await test("PATCH /projects/:id updates project", async () => {
    const { data } = await api.patch(`/projects/${projectId}`, {
      description: "Updated description",
    });
    assertEqual(data.description, "Updated description", "description");
  });

  // Repositories
  await test("POST /projects/:id/repositories creates repo", async () => {
    const { data, status } = await api.post(`/projects/${projectId}/repositories`, {
      name: "main-repo",
      remote_url: "https://github.com/example/test-repo.git",
      branch: "main",
      auth_type: "none",
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
    repoId = data.id;
    log("  → repoId:", repoId);
  });

  await test("GET /projects/:id/repositories returns repos", async () => {
    const { data } = await api.get(`/projects/${projectId}/repositories`);
    assert(Array.isArray(data), "is array");
    assert(data.length >= 1, "has at least one repo");
  });

  await test("PATCH /repositories/:id (standalone) updates repo status", async () => {
    const { data } = await api.patch(`/repositories/${repoId}`, {
      status: "ready",
      local_clone_path: "/workspaces/test",
    });
    assertEqual(data.status, "ready", "status");
  });

  // Agent Profiles
  await test("POST /agent-profiles creates profile", async () => {
    const { data, status } = await api.post("/agent-profiles", {
      name: "Test LangGraph Agent",
      description: "Smoke test agent",
      agent_type: "langgraph",
      llm_provider: "openai",
      llm_model: "gpt-4o",
      mcp_servers: [],
      skills: [],
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
    profileId = data.id;
    log("  → profileId:", profileId);
  });

  await test("GET /agent-profiles returns list", async () => {
    const { data } = await api.get("/agent-profiles");
    assert(Array.isArray(data), "is array");
    assert(data.some((p) => p.id === profileId), "contains created profile");
  });

  await test("GET /agent-profiles/:id returns profile", async () => {
    const { data } = await api.get(`/agent-profiles/${profileId}`);
    assertEqual(data.id, profileId, "id");
    assertEqual(data.agent_type, "langgraph", "agent_type");
  });

  await test("PATCH /agent-profiles/:id updates profile", async () => {
    const { data } = await api.patch(`/agent-profiles/${profileId}`, {
      description: "Updated description",
    });
    assertEqual(data.description, "Updated description", "description");
  });

  // Plans
  await test("POST /plans creates plan", async () => {
    const { data, status } = await api.post("/plans", {
      project_id: projectId,
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
    assertEqual(data.status, "draft", "initial status");
    planId = data.id;
    log("  → planId:", planId);
  });

  await test("GET /plans?project_id=... returns plan", async () => {
    const { data } = await api.get(`/plans?project_id=${projectId}`);
    assert(Array.isArray(data), "is array");
    assert(data.some((p) => p.id === planId), "contains plan");
  });

  // Tasks
  await test("POST /tasks creates task", async () => {
    const { data, status } = await api.post("/tasks", {
      plan_id: planId,
      title: "Implement user auth",
      description: "Add JWT authentication to the API",
      type: "code",
      execution_order: 1,
      agent_profile_id: profileId,
      repository_ids: [repoId],
      depends_on_task_ids: [],
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
    taskId = data.id;
    log("  → taskId:", taskId);
  });

  await test("POST /tasks creates dependent task", async () => {
    const { data } = await api.post("/tasks", {
      plan_id: planId,
      title: "Write auth tests",
      description: "Unit tests for JWT auth",
      type: "test",
      execution_order: 2,
      agent_profile_id: profileId,
      repository_ids: [repoId],
      depends_on_task_ids: [taskId],
    });
    assert(data.id, "has id");
  });

  await test("GET /tasks?plan_id=... returns tasks with deps", async () => {
    const { data } = await api.get(`/tasks?plan_id=${planId}`);
    assert(Array.isArray(data), "is array");
    assert(data.length === 2, `Expected 2 tasks, got ${data.length}`);
    const depTask = data.find((t) => t.execution_order === 2);
    assert(depTask, "has second task");
    assert(
      Array.isArray(depTask.depends_on_task_ids) && depTask.depends_on_task_ids.includes(taskId),
      "second task depends on first"
    );
  });

  await test("GET /plans/:id includes tasks", async () => {
    const { data } = await api.get(`/plans/${planId}`);
    assert(Array.isArray(data.tasks), "has tasks array");
    assert(data.tasks.length === 2, `Expected 2 tasks, got ${data.tasks.length}`);
  });

  // Messages
  await test("POST /messages creates message", async () => {
    const { data, status } = await api.post("/messages", {
      project_id: projectId,
      role: "user",
      content: "I want to build an auth system",
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.id, "has id");
  });

  await test("GET /messages?project_id=... returns messages", async () => {
    const { data } = await api.get(`/messages?project_id=${projectId}`);
    assert(Array.isArray(data), "is array");
    assert(data.length >= 1, "has at least one message");
  });

  // Confirm plan
  await test("PATCH /plans/:id confirms plan", async () => {
    const { data } = await api.patch(`/plans/${planId}`, { status: "confirmed" });
    assertEqual(data.status, "confirmed", "status");
  });

  // Cleanup
  await test("DELETE /agent-profiles/:id removes profile", async () => {
    const { status } = await api.delete(`/agent-profiles/${profileId}`);
    assertEqual(status, 204, "status");
  });

  await test("DELETE /projects/:id/repositories/:id removes repo", async () => {
    const { status } = await api.delete(`/projects/${projectId}/repositories/${repoId}`);
    assertEqual(status, 204, "status");
  });

  await test("DELETE /projects/:id removes project", async () => {
    const { status } = await api.delete(`/projects/${projectId}`);
    assertEqual(status, 204, "status");
  });
}

// ─── Execution lifecycle tests ────────────────────────────────────────────────
//
// Simulates what the agent-service does during plan execution using the
// internal API endpoints, without requiring real coding agents to be running.
// Covers: happy path, failure+cascade-skip, cancel, and task artifacts.

async function runExecutionLifecycleTests() {
  console.log("\n── Execution Lifecycle ───────────────────────────────────────");

  // ── Shared setup: project + repo + profile shared across sub-suites ──────

  const { data: project } = await api.post("/projects", {
    name: "Execution Lifecycle Test",
    description: "Created by execution lifecycle smoke tests",
  });
  const projectId = project.id;
  log("  → projectId:", projectId);

  const { data: repo } = await api.post(`/projects/${projectId}/repositories`, {
    name: "main-repo",
    remote_url: "https://github.com/example/test-repo.git",
    branch: "main",
    auth_type: "none",
  });
  const repoId = repo.id;

  const { data: profile } = await api.post("/agent-profiles", {
    name: "Lifecycle Test Agent",
    agent_type: "langgraph",
    llm_provider: "openai",
    llm_model: "gpt-4o",
    mcp_servers: [],
    skills: [],
  });
  const profileId = profile.id;

  try {
    // ── Suite A: Happy path (all tasks succeed) ───────────────────────────

    let planId, t1Id, t2Id, t3Id;

    await test("Lifecycle/setup: create plan with 3 linear tasks", async () => {
      const { data: plan } = await api.post("/plans", { project_id: projectId });
      planId = plan.id;

      const makeTask = (title, order, deps) =>
        api.post("/tasks", {
          plan_id: planId,
          title,
          description: title,
          type: "code",
          execution_order: order,
          agent_profile_id: profileId,
          repository_ids: [repoId],
          depends_on_task_ids: deps,
        });

      const { data: t1 } = await makeTask("Task 1", 1, []);
      t1Id = t1.id;
      const { data: t2 } = await makeTask("Task 2", 2, [t1Id]);
      t2Id = t2.id;
      const { data: t3 } = await makeTask("Task 3", 3, [t2Id]);
      t3Id = t3.id;

      assert(t1Id && t2Id && t3Id, "all three task IDs created");
      log("  → planId:", planId, "t1:", t1Id, "t2:", t2Id, "t3:", t3Id);
    });

    await test("Lifecycle/happy: confirm plan → status confirmed", async () => {
      const { data } = await api.patch(`/plans/${planId}`, { status: "confirmed" });
      assertEqual(data.status, "confirmed", "plan status");
    });

    await test("Lifecycle/happy: PATCH internal/plans/:id/status → executing", async () => {
      const { data } = await api.patch(`/internal/plans/${planId}/status`, {
        status: "executing",
      });
      assertEqual(data.status, "executing", "plan status after start");
    });

    await test("Lifecycle/happy: mark T1 in_progress → done", async () => {
      await api.patch(`/tasks/${t1Id}`, { status: "in_progress" });
      const { data } = await api.patch(`/tasks/${t1Id}`, { status: "done" });
      assertEqual(data.status, "done", "T1 status");
    });

    await test("Lifecycle/happy: create task artifacts for T1", async () => {
      const { status } = await api.post(`/internal/tasks/${t1Id}/artifacts`, {
        artifacts: [
          {
            type: "diff",
            title: "Git diff — main-repo",
            content: "diff --git a/auth.ts b/auth.ts\n+export function authenticate() {}",
            content_type: "text/x-diff",
            sort_order: 0,
          },
          {
            type: "log",
            title: "Agent log",
            content: "Task completed successfully in 4.2s",
            content_type: "text/plain",
            sort_order: 1,
          },
        ],
      });
      assertEqual(status, 201, "artifacts created status");
    });

    await test("Lifecycle/happy: mark T2 in_progress → done", async () => {
      await api.patch(`/tasks/${t2Id}`, { status: "in_progress" });
      const { data } = await api.patch(`/tasks/${t2Id}`, { status: "done" });
      assertEqual(data.status, "done", "T2 status");
    });

    await test("Lifecycle/happy: mark T3 in_progress → done", async () => {
      await api.patch(`/tasks/${t3Id}`, { status: "in_progress" });
      const { data } = await api.patch(`/tasks/${t3Id}`, { status: "done" });
      assertEqual(data.status, "done", "T3 status");
    });

    await test("Lifecycle/happy: PATCH internal/plans/:id/status → completed", async () => {
      const { data } = await api.patch(`/internal/plans/${planId}/status`, {
        status: "completed",
      });
      assertEqual(data.status, "completed", "plan status");
    });

    await test("Lifecycle/happy: GET /plans/:id shows completed with all done tasks", async () => {
      const { data } = await api.get(`/plans/${planId}`);
      assertEqual(data.status, "completed", "plan completed");
      const allDone = data.tasks.every((t) => t.status === "done");
      assert(allDone, `all tasks done — got: ${data.tasks.map((t) => t.status).join(", ")}`);
    });

    // ── Suite B: Failure + cascade-skip ───────────────────────────────────

    let planB, bT1, bT2, bT3;

    await test("Lifecycle/failure: create plan with T1 → T2 → T3 chain", async () => {
      const { data: plan } = await api.post("/plans", { project_id: projectId });
      planB = plan.id;

      const mk = (title, order, deps) =>
        api.post("/tasks", {
          plan_id: planB,
          title,
          description: title,
          type: "code",
          execution_order: order,
          agent_profile_id: profileId,
          repository_ids: [repoId],
          depends_on_task_ids: deps,
        });

      const { data: t1 } = await mk("Fail T1", 1, []);
      bT1 = t1.id;
      const { data: t2 } = await mk("Fail T2", 2, [bT1]);
      bT2 = t2.id;
      const { data: t3 } = await mk("Fail T3", 3, [bT2]);
      bT3 = t3.id;
      log("  → planB:", planB, "bT1:", bT1, "bT2:", bT2, "bT3:", bT3);
    });

    await test("Lifecycle/failure: confirm plan and start executing", async () => {
      await api.patch(`/plans/${planB}`, { status: "confirmed" });
      const { data } = await api.patch(`/internal/plans/${planB}/status`, { status: "executing" });
      assertEqual(data.status, "executing", "plan executing");
    });

    await test("Lifecycle/failure: mark T1 in_progress then failed", async () => {
      await api.patch(`/tasks/${bT1}`, { status: "in_progress" });
      const { data } = await api.patch(`/tasks/${bT1}`, { status: "failed" });
      assertEqual(data.status, "failed", "T1 failed");
    });

    await test("Lifecycle/failure: POST skip-dependents → T2 and T3 become skipped", async () => {
      const { data } = await api.post(`/internal/tasks/${bT1}/skip-dependents`);
      assert(typeof data.skipped === "number", "skipped count returned");
      assert(data.skipped >= 2, `Expected ≥2 skipped, got ${data.skipped}`);

      const { data: tasks } = await api.get(`/tasks?plan_id=${planB}`);
      const t2 = tasks.find((t) => t.id === bT2);
      const t3 = tasks.find((t) => t.id === bT3);
      assertEqual(t2.status, "skipped", "T2 skipped");
      assertEqual(t3.status, "skipped", "T3 skipped");
    });

    await test("Lifecycle/failure: PATCH plan → failed with failure_reason", async () => {
      const { data } = await api.patch(`/internal/plans/${planB}/status`, {
        status: "failed",
        failure_reason: "Task 1 failed: compilation error",
      });
      assertEqual(data.status, "failed", "plan failed");
    });

    await test("Lifecycle/failure: GET /plans/:id reflects final failed state", async () => {
      const { data } = await api.get(`/plans/${planB}`);
      assertEqual(data.status, "failed", "plan is failed");
      const t1Task = data.tasks.find((t) => t.id === bT1);
      assert(t1Task.status === "failed", "T1 status is failed in plan response");
    });

    // ── Suite C: Cancel pending tasks ─────────────────────────────────────

    let planC, cT1, cT2;

    await test("Lifecycle/cancel: create plan with 2 pending tasks", async () => {
      const { data: plan } = await api.post("/plans", { project_id: projectId });
      planC = plan.id;

      const mk = (title, order, deps) =>
        api.post("/tasks", {
          plan_id: planC,
          title,
          description: title,
          type: "code",
          execution_order: order,
          agent_profile_id: profileId,
          repository_ids: [repoId],
          depends_on_task_ids: deps,
        });

      const { data: t1 } = await mk("Cancel T1", 1, []);
      cT1 = t1.id;
      const { data: t2 } = await mk("Cancel T2", 2, [cT1]);
      cT2 = t2.id;
      log("  → planC:", planC, "cT1:", cT1, "cT2:", cT2);
    });

    await test("Lifecycle/cancel: confirm plan and start executing", async () => {
      await api.patch(`/plans/${planC}`, { status: "confirmed" });
      await api.patch(`/internal/plans/${planC}/status`, { status: "executing" });
    });

    await test("Lifecycle/cancel: POST cancel-tasks cancels pending tasks", async () => {
      const { data } = await api.post(`/internal/plans/${planC}/cancel-tasks`);
      assert(typeof data.cancelled === "number", "cancelled count returned");
      assert(data.cancelled >= 2, `Expected ≥2 cancelled, got ${data.cancelled}`);

      const { data: tasks } = await api.get(`/tasks?plan_id=${planC}`);
      const allCancelled = tasks.every((t) => t.status === "cancelled");
      assert(allCancelled, `all tasks should be cancelled — got: ${tasks.map((t) => t.status).join(", ")}`);
    });

    await test("Lifecycle/cancel: cancel-tasks on already-cancelled plan is idempotent", async () => {
      const { data } = await api.post(`/internal/plans/${planC}/cancel-tasks`);
      // All tasks already cancelled — nothing new to cancel
      assertEqual(data.cancelled, 0, "no additional tasks cancelled");
    });

  } finally {
    // Cleanup shared resources
    await api.delete(`/agent-profiles/${profileId}`).catch(() => {});
    await api.delete(`/projects/${projectId}/repositories/${repoId}`).catch(() => {});
    await api.delete(`/projects/${projectId}`).catch(() => {});
  }
}

// ─── Agent Service tests ──────────────────────────────────────────────────────

async function runAgentServiceTests() {
  console.log("\n── Agent Service ─────────────────────────────────────────────");

  await test("GET /health returns ok", async () => {
    const { data } = await axios.get(`${AGENT_URL}/health`);
    assertEqual(data.status, "ok", "health status");
  });
}

// ─── LLM connectivity test ─────────────────────────────────────────────────────

async function runLLMTest() {
  console.log("\n── LLM Connectivity ──────────────────────────────────────────");

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log("  ⚠  LLM_API_KEY not set — skipping LLM test");
    return;
  }

  const provider = process.env.LLM_PROVIDER ?? "openai";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  await test(`POST /test-llm returns ok (provider=${provider}, model=${model})`, async () => {
    const { data } = await axios.post(`${AGENT_URL}/test-llm`, { provider, model, apiKey });
    assert(data.ok === true, `LLM test failed: ${JSON.stringify(data)}`);
  });
}

// ─── SSE test ─────────────────────────────────────────────────────────────────

async function runSSETest() {
  console.log("\n── SSE ───────────────────────────────────────────────────────");

  // Create a temporary project and plan for SSE connectivity test
  const { data: proj } = await api.post("/projects", {
    name: "SSE Smoke Test",
    description: "Temporary SSE test project",
  });
  const projectId = proj.id;

  let planId;
  try {
    const { data: plan } = await api.post("/plans", { project_id: projectId });
    planId = plan.id;

    await test("SSE connects to /chat/:planId/stream with correct headers", () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("SSE connection timed out after 5s"));
        }, 5000);

        const agentUrl = new URL(`/chat/${planId}/stream`, AGENT_URL);
        const transport = agentUrl.protocol === "https:" ? https : http;

        const req = transport.request(
          agentUrl,
          { method: "GET" },
          (res) => {
            clearTimeout(timeout);
            try {
              assert(res.statusCode === 200, `Expected status 200, got ${res.statusCode}`);
              const ct = res.headers["content-type"] ?? "";
              assert(
                ct.startsWith("text/event-stream"),
                `Expected content-type text/event-stream, got ${ct}`
              );
              res.destroy();
              resolve();
            } catch (err) {
              res.destroy();
              reject(err);
            }
          }
        );

        req.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        req.end();
      })
    );
  } finally {
    // Cleanup
    await api.delete(`/projects/${projectId}`).catch(() => {});
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("SWE AI Platform — Integration Smoke Tests");
  console.log(`  Data API:      ${DATA_API}`);
  console.log(`  Agent Service: ${AGENT_URL}`);
  console.log(`  Internal key:  ${INTERNAL_KEY.slice(0, 8)}…`);

  try {
    await runDataApiTests();
  } catch (err) {
    console.error("Fatal error in Data API tests:", err.message);
  }

  try {
    await runExecutionLifecycleTests();
  } catch (err) {
    console.error("Fatal error in Execution Lifecycle tests:", err.message);
  }

  try {
    await runAgentServiceTests();
  } catch (err) {
    console.error("Fatal error in Agent Service tests:", err.message);
  }

  try {
    await runLLMTest();
  } catch (err) {
    console.error("Fatal error in LLM tests:", err.message);
  }

  try {
    await runSSETest();
  } catch (err) {
    console.error("Fatal error in SSE tests:", err.message);
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (failures.length > 0) {
    console.error("Failed tests:");
    failures.forEach(({ name, error }) => console.error(`  - ${name}: ${error}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
