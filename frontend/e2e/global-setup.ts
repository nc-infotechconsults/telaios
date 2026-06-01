/**
 * Playwright global setup — runs once before all tests.
 *
 * 1. Registers a test user and obtains a JWT.
 * 2. Seeds three projects (executing, planning-only, completed) with the
 *    exact data the e2e specs assert against.
 * 3. Saves browser storage state (JWT in localStorage) to
 *    e2e/fixtures/.auth.json so every test starts authenticated.
 * 4. Writes seeded entity IDs to e2e/fixtures/ci-data.json for tests
 *    to read via loadCIData().
 */
import { chromium, type FullConfig } from "@playwright/test";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "dev-internal-key";

const FIXTURES_DIR = path.join(__dirname, "fixtures");
export const AUTH_FILE = path.join(FIXTURES_DIR, ".auth.json");
export const CI_DATA_FILE = path.join(FIXTURES_DIR, "ci-data.json");

/** Shape persisted to ci-data.json. */
export interface CIData {
  executingProjectId: string;
  planningProjectId: string;
  completedProjectId: string;
  executingPlanId: string;
  completedPlanId: string;
  agentProfileId: string;
  /** Profile with system_prompt + sub_agent_ids — used by agent-profiles.spec.ts */
  promptProfileId: string;
  /** Simple profile used as the sub-agent target — used by agent-profiles.spec.ts */
  subAgentProfileId: string;
  t1Id: string;
  t2Id: string;
  t3Id: string;
  t4Id: string;
  t5Id: string;
  ct1Id: string;
  apiServiceRepoId: string;
  authServiceRepoId: string;
}

/** Reads the fixture written by globalSetup. */
export function loadCIData(): CIData {
  return JSON.parse(fs.readFileSync(CI_DATA_FILE, "utf-8")) as CIData;
}

const internalApi = axios.create({
  baseURL: SERVER_URL,
  headers: { "X-Internal-Api-Key": INTERNAL_KEY },
});

let api = axios.create({ baseURL: SERVER_URL });

async function makeTask(
  planId: string,
  profileId: string,
  repoIds: string[],
  title: string,
  description: string,
  order: number,
  deps: string[],
): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>(`/plans/${planId}/tasks`, {
    title,
    description,
    type: "code",
    execution_order: order,
    agent_profile_id: profileId,
    repository_ids: repoIds,
    depends_on_task_ids: deps,
  });
  return data;
}

export default async function globalSetup(config: FullConfig) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // ── 1. Register test user + get JWT ────────────────────────────────────────
  const email = "e2e-test@example.com";
  const password = "E2eTest1234!";
  let token: string;
  let userId: string;

  try {
    const { data } = await axios.post<{ token: string; user: { id: string } }>(`${SERVER_URL}/auth/register`, {
      email,
      password,
      display_name: "E2E Test User",
    });
    token = data.token;
    userId = data.user.id;
  } catch {
    // User already exists from a previous run — just log in
    const { data } = await axios.post<{ token: string; user: { id: string } }>(`${SERVER_URL}/auth/login`, { email, password });
    token = data.token;
    userId = data.user.id;
  }

  // Ensure the e2e user is always an admin (needed for settings page tests)
  await internalApi.patch(`/internal/users/${userId}/role`, { system_role: "admin" });
  // Re-login to get a fresh token with the updated role encoded in it
  const { data: refreshed } = await axios.post<{ token: string }>(`${SERVER_URL}/auth/login`, { email, password });
  token = refreshed.token;

  api = axios.create({
    baseURL: SERVER_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  // ── 1b. Clean up any leftover E2E data from previous runs ──────────────────
  const E2E_PROFILE_NAMES = ["GPT-4o Coder", "E2E Prompt Profile", "E2E Sub-Agent"];
  const E2E_PROJECT_NAMES = ["E2E Executing Project", "E2E Planning Project", "E2E Completed Project"];

  // agent-profiles returns a plain array
  try {
    const { data: existingProfiles } = await api.get<{ id: string; name: string }[]>("/agent-profiles");
    for (const p of existingProfiles.filter(p => E2E_PROFILE_NAMES.includes(p.name))) {
      await api.delete(`/agent-profiles/${p.id}`).catch(() => {});
    }
  } catch { /* ignore */ }

  // projects returns { items: [...] }
  try {
    const { data: existingProjects } = await api.get<{ items: { id: string; name: string }[] }>("/projects?limit=200");
    for (const p of (existingProjects.items ?? []).filter(p => E2E_PROJECT_NAMES.includes(p.name))) {
      await api.delete(`/projects/${p.id}`).catch(() => {});
    }
  } catch { /* ignore */ }

  // ── 2. Agent profile ────────────────────────────────────────────────────────
  const { data: agentProfile } = await api.post<{ id: string }>("/agent-profiles", {
    name: "GPT-4o Coder",
    description: "LangGraph coding agent",
    agent_type: "langgraph",
    llm_provider: "openai",
    llm_model: "gpt-4o",
    mcp_servers: [],
    skills: [],
  });
  const agentProfileId = agentProfile.id;

  // ── 2b. Sub-agent profile (used as a delegation target in agent-profiles.spec.ts) ───
  const { data: subAgentProfile } = await api.post<{ id: string }>("/agent-profiles", {
    name: "E2E Sub-Agent",
    description: "Simple sub-agent profile seeded for E2E tests",
    agent_type: "langgraph",
    llm_provider: "openai",
    llm_model: "gpt-4o-mini",
    mcp_servers: [],
    skills: [],
  });
  const subAgentProfileId = subAgentProfile.id;

  // ── 2c. Profile with system_prompt + sub_agent_ids (agent-profiles.spec.ts) ──────────
  const { data: promptProfile } = await api.post<{ id: string }>("/agent-profiles", {
    name: "E2E Prompt Profile",
    description: "Profile with custom system prompt for E2E badge tests",
    agent_type: "langgraph",
    llm_provider: "openai",
    llm_model: "gpt-4o",
    mcp_servers: [],
    skills: [],
    system_prompt: "E2E custom prompt content",
    system_prompt_mode: "extend",
    llm_temperature: 0.7,
    sub_agent_ids: [subAgentProfileId],
  });
  const promptProfileId = promptProfile.id;

  // ── 3. Executing project ────────────────────────────────────────────────────
  const { data: execProject } = await api.post<{ id: string }>("/projects", {
    name: "E2E Executing Project",
    description: "CI test: executing project",
  });
  const executingProjectId = execProject.id;

  const { data: apiRepo } = await api.post<{ id: string }>(`/projects/${executingProjectId}/repositories`, {
    name: "api-service",
    remote_url: "https://github.com/org/api-service.git",
    branch: "main",
    auth_type: "none",
  });
  const { data: authRepo } = await api.post<{ id: string }>(`/projects/${executingProjectId}/repositories`, {
    name: "auth-service",
    remote_url: "https://github.com/org/auth-service.git",
    branch: "main",
    auth_type: "none",
  });
  await api.post(`/projects/${executingProjectId}/repositories`, {
    name: "infra-scripts",
    remote_url: "https://github.com/org/infra-scripts.git",
    branch: "main",
    auth_type: "none",
  });

  const { data: execPlan } = await api.post<{ id: string }>(`/projects/${executingProjectId}/plans`, {});
  const executingPlanId = execPlan.id;

  const t1 = await makeTask(executingPlanId, agentProfileId, [authRepo.id],
    "Extract Auth Service",
    "Move authentication logic into a standalone service",
    0, []);
  const t2 = await makeTask(executingPlanId, agentProfileId, [apiRepo.id],
    "Extract Product Catalog Service",
    "Extract product catalog into a dedicated microservice",
    1, []);
  const t3 = await makeTask(executingPlanId, agentProfileId, [apiRepo.id],
    "Extract Order Management Service",
    "Separate order management from the monolith",
    2, [t1.id, t2.id]);
  const t4 = await makeTask(executingPlanId, agentProfileId, [apiRepo.id, authRepo.id],
    "Integration & Regression Tests",
    "End-to-end integration tests for all new microservices",
    3, [t2.id, t3.id]);
  const t5 = await makeTask(executingPlanId, agentProfileId, [apiRepo.id],
    "Traffic Cutover & Decommission Monolith",
    "Gradually shift traffic and decommission the legacy monolith",
    4, [t4.id]);

  // Set task statuses: t1=done, t2=done, t3=in_progress, t4/t5=pending
  await api.patch(`/tasks/${t1.id}`, { status: "in_progress" });
  await api.patch(`/tasks/${t1.id}`, { status: "done" });
  await api.patch(`/tasks/${t2.id}`, { status: "in_progress" });
  await api.patch(`/tasks/${t2.id}`, { status: "done" });
  await api.patch(`/tasks/${t3.id}`, { status: "in_progress" });

  await api.patch(`/plans/${executingPlanId}`, { status: "confirmed" });
  await internalApi.patch(`/internal/plans/${executingPlanId}/status`, { status: "executing" });

  // ── 4. Planning project (only a draft plan — no active plan) ────────────────
  const { data: planningProject } = await api.post<{ id: string }>("/projects", {
    name: "E2E Planning Project",
    description: "CI test: planning-only project",
  });
  const planningProjectId = planningProject.id;
  await api.post(`/projects/${planningProjectId}/plans`, {});

  // ── 5. Completed project ────────────────────────────────────────────────────
  const { data: completedProject } = await api.post<{ id: string }>("/projects", {
    name: "E2E Completed Project",
    description: "CI test: completed project",
  });
  const completedProjectId = completedProject.id;

  const { data: completedPlan } = await api.post<{ id: string }>(`/projects/${completedProjectId}/plans`, {});
  const completedPlanId = completedPlan.id;

  const ct1 = await makeTask(completedPlanId, agentProfileId, [],
    "Design Airflow DAG topology", "Design the DAG topology for Airflow", 0, []);
  const ct2 = await makeTask(completedPlanId, agentProfileId, [],
    "Implement ETL pipeline", "Build the ETL pipeline", 1, [ct1.id]);
  const ct3 = await makeTask(completedPlanId, agentProfileId, [],
    "Configure dbt models", "Set up dbt models for analytics", 2, [ct2.id]);

  for (const id of [ct1.id, ct2.id, ct3.id]) {
    await api.patch(`/tasks/${id}`, { status: "in_progress" });
    await api.patch(`/tasks/${id}`, { status: "done" });
  }
  await api.patch(`/plans/${completedPlanId}`, { status: "confirmed" });
  await internalApi.patch(`/internal/plans/${completedPlanId}/status`, { status: "executing" });
  await internalApi.patch(`/internal/plans/${completedPlanId}/status`, { status: "completed" });

  // ── 6. Write CI data fixture ────────────────────────────────────────────────
  const ciData: CIData = {
    executingProjectId,
    planningProjectId,
    completedProjectId,
    executingPlanId,
    completedPlanId,
    agentProfileId,
    promptProfileId,
    subAgentProfileId,
    t1Id: t1.id,
    t2Id: t2.id,
    t3Id: t3.id,
    t4Id: t4.id,
    t5Id: t5.id,
    ct1Id: ct1.id,
    apiServiceRepoId: apiRepo.id,
    authServiceRepoId: authRepo.id,
  };
  fs.writeFileSync(CI_DATA_FILE, JSON.stringify(ciData, null, 2));

  // ── 7. Save browser auth storage state ─────────────────────────────────────
  const baseURL =
    (config.projects[0]?.use as { baseURL?: string } | undefined)?.baseURL ?? "http://localhost:5173";

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.evaluate((t) => localStorage.setItem("swe_auth_token", t), token);
  await page.evaluate(() => localStorage.removeItem("telaios_app_settings"));
  await context.storageState({ path: AUTH_FILE });
  await browser.close();
}
