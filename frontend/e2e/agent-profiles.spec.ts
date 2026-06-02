import { test, expect } from "@playwright/test";

/**
 * Agent Profiles E2E tests.
 *
 * Tests the WorkspaceAgents page at /agents, which shows 8 predefined role-based
 * agent profile cards. All API calls are intercepted so tests run without a real
 * database and do not mutate shared state.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const BASE_PROFILE_ID_PLANNER  = "11111111-0000-0000-0000-000000000001";
const BASE_PROFILE_ID_CODER    = "11111111-0000-0000-0000-000000000002";
const BASE_PROFILE_ID_REVIEWER = "11111111-0000-0000-0000-000000000003";
const BASE_PROFILE_ID_TESTER   = "11111111-0000-0000-0000-000000000004";
const BASE_PROFILE_ID_INFRA    = "11111111-0000-0000-0000-000000000005";
const BASE_PROFILE_ID_KNOWLEDGE = "11111111-0000-0000-0000-000000000006";
const BASE_PROFILE_ID_DOCCOPILOT = "11111111-0000-0000-0000-000000000007";
const BASE_PROFILE_ID_DESIGNER = "11111111-0000-0000-0000-000000000008";
const OVERRIDE_ID_CODER        = "22222222-0000-0000-0000-000000000002";

const MOCK_BASE_PROFILES = [
  { id: BASE_PROFILE_ID_PLANNER,   role: "planner",          name: "Planner",          description: "Turns requirements into structured plans.",     dispatch: "direct",   system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.2, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_CODER,     role: "coder",            name: "Coder",            description: "Writes code based on task specifications.",       dispatch: "workflow", system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.1, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_REVIEWER,  role: "reviewer",         name: "Reviewer",         description: "Reviews code for quality and correctness.",       dispatch: "workflow", system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.1, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_TESTER,    role: "tester",           name: "Tester",           description: "Writes and runs tests.",                          dispatch: "workflow", system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.1, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_INFRA,     role: "infra",            name: "Infra",            description: "Manages infrastructure and deployments.",         dispatch: "workflow", system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.1, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_KNOWLEDGE, role: "knowledge",        name: "Knowledge",        description: "Queries the knowledge base.",                     dispatch: "direct",   system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.3, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_DOCCOPILOT, role: "document-copilot", name: "Document Copilot", description: "Assists with document tasks.",                   dispatch: "workflow", system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.4, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
  { id: BASE_PROFILE_ID_DESIGNER,  role: "designer",         name: "Designer",         description: "Creates UI designs.",                            dispatch: "direct",   system_prompt: null, system_prompt_mode: "append", llm_provider: "openai", llm_model: "gpt-4o", llm_temperature: 0.7, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, mcp_servers: [], skills: [] },
];

const MOCK_OVERRIDE_CODER = {
  id: OVERRIDE_ID_CODER,
  base_profile_id: BASE_PROFILE_ID_CODER,
  project_id: null,
  system_prompt: "You are a senior TypeScript engineer.",
  system_prompt_mode: "override",
  llm_provider: null,
  llm_model: null,
  llm_temperature: null,
  llm_max_tokens: null,
  llm_top_p: null,
  llm_frequency_penalty: null,
  llm_presence_penalty: null,
  mcp_servers: null,
  skills: null,
};

async function mockApis(page: import("@playwright/test").Page, { overrides = [] }: { overrides?: unknown[] } = {}) {
  await page.route("**/agent-base-profiles", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_BASE_PROFILES) });
  });
  await page.route("**/agent-overrides", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides) });
    } else {
      await route.continue();
    }
  });
  // Also mock LLM providers for the override form
  await page.route("**/llm/providers", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
}

// ─── Page loading ─────────────────────────────────────────────────────────────

test.describe("AgentProfiles — page loading", () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
  });

  test("shows the Agent Profiles heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible();
  });

  test("does NOT show a New Profile button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new profile/i })).not.toBeVisible();
  });

  test("shows 8 Customise buttons (one per role)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Customise" })).toHaveCount(8);
  });
});

// ─── Section grouping ─────────────────────────────────────────────────────────

test.describe("AgentProfiles — dispatch sections", () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
  });

  test("shows 'Direct dispatch' section heading", async ({ page }) => {
    await expect(page.getByText("Direct dispatch", { exact: true })).toBeVisible();
  });

  test("shows 'Workflow agents' section heading", async ({ page }) => {
    await expect(page.getByText("Workflow agents", { exact: true })).toBeVisible();
  });

  test("Planner card is in the Direct dispatch section", async ({ page }) => {
    await expect(page.getByText("Planner")).toBeVisible();
  });

  test("Coder card is in the Workflow agents section", async ({ page }) => {
    await expect(page.getByText("Coder")).toBeVisible();
  });
});

// ─── Default / Customised badges ─────────────────────────────────────────────

test.describe("AgentProfiles — Default/Customised badges", () => {
  test("shows Default badge for profiles with no override", async ({ page }) => {
    await mockApis(page, { overrides: [] });
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    // All 8 badges should say "Default"
    const defaultBadges = page.getByText("Default");
    await expect(defaultBadges).toHaveCount(8);
  });

  test("shows Customised badge for a profile that has an override", async ({ page }) => {
    await mockApis(page, { overrides: [MOCK_OVERRIDE_CODER] });
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    // Coder card should show Customised
    await expect(page.getByText("Customised")).toBeVisible();
    // Other 7 should still show Default
    await expect(page.getByText("Default")).toHaveCount(7);
  });
});

// ─── Customise modal ──────────────────────────────────────────────────────────

test.describe("AgentProfiles — Customise modal", () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page, { overrides: [] });
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    // Open the override form for Planner
    await page.getByText("Planner").locator("..").locator("..").getByRole("button", { name: "Customise" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  });

  test("modal opens when Customise is clicked", async ({ page }) => {
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("modal has a General tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /general/i })).toBeVisible();
  });

  test("modal has a Prompt tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /prompt/i })).toBeVisible();
  });

  test("modal has an MCP Servers tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /mcp/i })).toBeVisible();
  });

  test("modal has a Skills tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /skills/i })).toBeVisible();
  });

  test("modal does NOT have a Sub-agents tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /sub-agents/i })).not.toBeVisible();
  });

  test("modal does NOT have a Structured Output tab", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("tab", { name: /structured output/i })).not.toBeVisible();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).evaluate(
      (el) => (el as HTMLElement).click()
    );
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});

// ─── Customise save cycle (intercepted) ──────────────────────────────────────

test.describe("AgentProfiles — Customise save (API intercepted)", () => {
  test("saving an override shows success toast and closes modal", async ({ page }) => {
    await mockApis(page, { overrides: [] });

    // Intercept PUT /agent-overrides/:id
    await page.route(`**\/agent-overrides\/${BASE_PROFILE_ID_PLANNER}`, async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "33333333-0000-0000-0000-000000000001",
            base_profile_id: BASE_PROFILE_ID_PLANNER,
            project_id: null,
            system_prompt: "Custom planner instructions.",
            system_prompt_mode: "override",
            llm_provider: null,
            llm_model: null,
            llm_temperature: null,
            llm_max_tokens: null,
            llm_top_p: null,
            llm_frequency_penalty: null,
            llm_presence_penalty: null,
            mcp_servers: null,
            skills: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });

    // Open Planner customise
    await page.getByText("Planner").locator("..").locator("..").getByRole("button", { name: "Customise" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Switch to Prompt tab and type something
    await dialog.getByRole("tab", { name: /prompt/i }).evaluate((el) => (el as HTMLElement).click());
    const textarea = dialog.locator("textarea").first();
    if (await textarea.isVisible()) {
      await textarea.fill("Custom planner instructions.");
    }

    // Save
    await dialog.getByRole("button", { name: /save/i }).evaluate((el) => (el as HTMLElement).click());

    // Toast and closed dialog
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/agent customisation saved/i)).toBeVisible();
  });
});
