/**
 * Smoke / Integration tests for SWE AI Platform
 *
 * Requires all services to be running:
 *   docker compose up   (or npm run dev in each service)
 *
 * Usage:
 *   npm test
 *   DATA_API_URL=http://localhost:3000 AGENT_URL=http://localhost:8000 npm test
 */

import axios from "axios";
import http from "http";
import https from "https";

const DATA_API = process.env.DATA_API_URL ?? "http://localhost:3000";
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";
const VERBOSE = process.env.VERBOSE === "1";

const api = axios.create({ baseURL: DATA_API });

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

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runDataApiTests() {
  console.log("\n── Data API ──────────────────────────────────────────────────");

  let projectId, repoId, profileId, planId, taskId;

  await test("GET /health returns ok", async () => {
    const { data } = await api.get("/health");
    assertEqual(data.status, "ok", "health status");
  });

  // Settings
  await test("GET /settings returns settings object", async () => {
    const { data } = await api.get("/settings");
    assert(typeof data === "object", "settings is object");
    assert("llm_provider" in data, "has llm_provider");
  });

  await test("PUT /settings updates provider", async () => {
    const { data } = await api.put("/settings", {
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

async function runAgentServiceTests() {
  console.log("\n── Agent Service ─────────────────────────────────────────────");

  await test("GET /health returns ok", async () => {
    const { data } = await axios.get(`${AGENT_URL}/health`);
    assertEqual(data.status, "ok", "health status");
  });
}

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

  try {
    await runDataApiTests();
  } catch (err) {
    console.error("Fatal error in Data API tests:", err.message);
  }

  try {
    await runAgentServiceTests();
  } catch (err) {
    console.error("Fatal error in Agent Service tests:", err.message);
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
