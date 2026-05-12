import { test, expect } from "@playwright/test";
import { loadCIData } from "./global-setup";

/**
 * Agent Profiles E2E tests.
 *
 * Run against the real FastAPI server.
 * Test data is seeded in global-setup.ts:
 *
 *   agentProfile      — "GPT-4o Coder"      (no system_prompt, no sub-agents)
 *   promptProfile     — "E2E Prompt Profile" (system_prompt="E2E custom prompt content",
 *                                             system_prompt_mode="extend", llm_temperature=0.7,
 *                                             sub_agent_ids=[subAgentProfileId])
 *   subAgentProfile   — "E2E Sub-Agent"      (plain profile used as delegation target)
 *
 * Destructive operations (create / delete) intercept the relevant API calls via
 * page.route() so they do not mutate the shared database state and break
 * subsequent tests.
 */

const data = loadCIData();

// ─── Page loading ─────────────────────────────────────────────────────────────

test.describe("AgentProfiles — page loading", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
  });

  test("shows the Agent Profiles heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible();
  });

  test("shows the GPT-4o Coder profile seeded by global-setup", async ({ page }) => {
    await expect(page.getByText("GPT-4o Coder")).toBeVisible();
  });

  test("shows the E2E Prompt Profile seeded by global-setup", async ({ page }) => {
    await expect(page.getByText("E2E Prompt Profile")).toBeVisible();
  });

  test("shows the E2E Sub-Agent profile seeded by global-setup", async ({ page }) => {
    await expect(page.getByText("E2E Sub-Agent")).toBeVisible();
  });

  test("shows a New Profile button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new profile/i })).toBeVisible();
  });
});

// ─── Grid view badges ─────────────────────────────────────────────────────────

test.describe("AgentProfiles — grid view badges", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    // Default view is grid; ensure it's active
    const viewGroup = page.getByRole("group", { name: /view/i });
    if (await viewGroup.count()) {
      const gridBtn = viewGroup.getByText("Grid");
      if (await gridBtn.count()) await gridBtn.click();
    }
  });

  test("shows 💬 prompt badge for profile with system_prompt", async ({ page }) => {
    // The E2E Prompt Profile card should contain the 💬 prompt chip
    const card = page.locator("[class*=CardBody]").filter({ hasText: "E2E Prompt Profile" });
    await expect(card.getByTitle("E2E custom prompt content")).toBeVisible();
  });

  test("does NOT show 💬 prompt badge for profile without system_prompt", async ({ page }) => {
    const card = page.locator("[class*=CardBody]").filter({ hasText: "GPT-4o Coder" });
    // The 💬 chip should NOT be present
    await expect(card.getByTitle(/custom prompt/i)).not.toBeVisible();
  });

  test("shows 🤝 sub-agent badge for profile with sub_agent_ids", async ({ page }) => {
    const card = page.locator("[class*=CardBody]").filter({ hasText: "E2E Prompt Profile" });
    await expect(card.getByText(/🤝/)).toBeVisible();
  });

  test("does NOT show 🤝 sub-agent badge for profile without sub_agent_ids", async ({ page }) => {
    const card = page.locator("[class*=CardBody]").filter({ hasText: "GPT-4o Coder" });
    await expect(card.getByText(/🤝/)).not.toBeVisible();
  });
});

// ─── List view ────────────────────────────────────────────────────────────────

test.describe("AgentProfiles — list view badges", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    const viewGroup = page.getByRole("group", { name: /view/i });
    await viewGroup.getByText("List").click();
  });

  test("list view renders a row for each seeded profile", async ({ page }) => {
    await expect(page.getByText("GPT-4o Coder")).toBeVisible();
    await expect(page.getByText("E2E Prompt Profile")).toBeVisible();
    await expect(page.getByText("E2E Sub-Agent")).toBeVisible();
  });

  test("list view shows 💬 icon for profile with system_prompt", async ({ page }) => {
    // Each row is a flex div; find the one for E2E Prompt Profile
    const row = page.locator("div").filter({ hasText: /^E2E Prompt Profile/ }).first();
    await expect(row.getByTitle("E2E custom prompt content")).toBeVisible();
  });
});

// ─── Table view ───────────────────────────────────────────────────────────────

test.describe("AgentProfiles — table view badges", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    const viewGroup = page.getByRole("group", { name: /view/i });
    await viewGroup.getByText("Table").click();
  });

  test("table view renders a row for E2E Prompt Profile", async ({ page }) => {
    await expect(page.getByRole("cell", { name: /E2E Prompt Profile/i })).toBeVisible();
  });

  test("table view shows 💬 chip for profile with system_prompt", async ({ page }) => {
    const promptCell = page.getByRole("row").filter({ hasText: "E2E Prompt Profile" });
    await expect(promptCell.getByTitle("E2E custom prompt content")).toBeVisible();
  });

  test("table view shows 🤝 chip for profile with sub_agent_ids", async ({ page }) => {
    const promptRow = page.getByRole("row").filter({ hasText: "E2E Prompt Profile" });
    await expect(promptRow.getByText(/🤝/)).toBeVisible();
  });
});

// ─── New Profile modal — form sections ───────────────────────────────────────

test.describe("AgentProfiles — New Profile modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /new profile/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Agent Profile" })).toBeVisible();
  });

  test("dialog contains the Name field", async ({ page }) => {
    await expect(page.getByRole("dialog").getByLabel("Name")).toBeVisible();
  });

  test("dialog contains the System Prompt section heading", async ({ page }) => {
    await expect(page.getByRole("dialog").getByText("System Prompt")).toBeVisible();
  });

  test("dialog contains the System Prompt textarea", async ({ page }) => {
    await expect(page.getByRole("dialog").getByLabel("System Prompt")).toBeVisible();
  });

  test("default system prompt mode is Extend", async ({ page }) => {
    // HeroUI Select renders a button-like element whose text reflects the selected option
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Extend — append to built-in prompt/i)).toBeVisible();
  });

  test("changing mode to Override updates the description text", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    // Click the Mode select to open it
    await dialog.getByText(/Extend — append to built-in prompt/i).click();
    // Pick Override option in the listbox
    await page.getByRole("option", { name: /Override/i }).click();
    await expect(dialog.getByText("Fully replaces the built-in agent prompt.")).toBeVisible();
  });

  test("system prompt textarea accepts input", async ({ page }) => {
    const textarea = page.getByRole("dialog").getByLabel("System Prompt");
    await textarea.fill("You are a specialized test agent.");
    await expect(textarea).toHaveValue("You are a specialized test agent.");
  });

  test("dialog contains the Temperature slider", async ({ page }) => {
    await expect(page.getByRole("dialog").getByRole("slider", { name: /temperature/i })).toBeVisible();
  });

  test("dialog contains the Max Tokens input", async ({ page }) => {
    await expect(page.getByRole("dialog").getByLabel("Max Tokens")).toBeVisible();
  });

  test("Advanced sampling toggle reveals Top P input", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    // Top P should not be visible yet
    await expect(dialog.getByLabel("Top P")).not.toBeVisible();
    // Click the Advanced toggle
    await dialog.getByText("Advanced sampling parameters").click();
    await expect(dialog.getByLabel("Top P")).toBeVisible();
  });

  test("Sub-agents section is visible", async ({ page }) => {
    await expect(page.getByRole("dialog").getByText("Sub-agents")).toBeVisible();
  });

  test("Sub-agents picker shows other profiles as options", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    // Open the Add sub-agent select
    const subAgentSelect = dialog.getByText(/Select an agent profile/i);
    await subAgentSelect.click();
    // E2E Sub-Agent should appear as an option
    await expect(page.getByRole("option", { name: "E2E Sub-Agent" })).toBeVisible();
  });

  test("selecting a sub-agent adds it as a chip", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByText(/Select an agent profile/i).click();
    await page.getByRole("option", { name: "E2E Sub-Agent" }).click();
    // A chip with the profile name should appear
    await expect(dialog.getByText("E2E Sub-Agent").first()).toBeVisible();
  });

  test("cancelling closes the dialog", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});

// ─── Edit Profile modal — pre-filled values ───────────────────────────────────

test.describe("AgentProfiles — Edit Profile modal pre-fill", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    // Open the edit modal for the E2E Prompt Profile
    await page.getByRole("button", { name: `Edit E2E Prompt Profile` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("edit modal header shows Editing E2E Prompt Profile", async ({ page }) => {
    await expect(page.getByRole("dialog").getByText(/Editing: E2E Prompt Profile/i)).toBeVisible();
  });

  test("system prompt textarea is pre-filled with saved value", async ({ page }) => {
    const textarea = page.getByRole("dialog").getByLabel("System Prompt");
    await expect(textarea).toHaveValue("E2E custom prompt content");
  });

  test("mode select shows saved mode (Extend)", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Extend — append to built-in prompt/i)).toBeVisible();
  });

  test("sub-agent chip is pre-populated with E2E Sub-Agent", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    // The chip label shows the sub-agent's name
    await expect(dialog.getByText("E2E Sub-Agent").first()).toBeVisible();
  });
});

// ─── Create cycle (intercepted) ───────────────────────────────────────────────

test.describe("AgentProfiles — Create cycle (API intercepted)", () => {
  test("filling required fields and saving shows success toast + closes modal", async ({ page }) => {
    const newProfileId = "00000000-0000-0000-0000-000000000099";

    // Intercept POST /agent-profiles so we don't pollute the DB
    await page.route("**/agent-profiles", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: newProfileId,
            name: "Test Intercepted Profile",
            description: "",
            agent_type: "langgraph",
            llm_provider: "openai",
            llm_model: "gpt-4o",
            mcp_servers: [],
            skills: [],
            system_prompt: null,
            system_prompt_mode: "extend",
            sub_agent_ids: [],
            has_llm_api_key: false,
            has_github_token: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /new profile/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill in the minimum required field (Name) + a system prompt
    await dialog.getByLabel("Name").fill("Test Intercepted Profile");
    const textarea = dialog.getByLabel("System Prompt");
    await textarea.fill("I am a test agent.");

    // Save
    await dialog.getByRole("button", { name: "Create Profile" }).click();

    // Modal should close and success toast should appear
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/agent profile created/i)).toBeVisible();
  });
});

// ─── Delete cycle ─────────────────────────────────────────────────────────────

test.describe("AgentProfiles — Delete cycle (API intercepted)", () => {
  test("delete button shows confirmation modal with profile name", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });

    // Click delete on the GPT-4o Coder profile (intercepted so it isn't really deleted)
    await page.route(`**/agent-profiles/${data.agentProfileId}`, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: `Delete GPT-4o Coder` }).click();

    // Confirm dialog should show the profile name
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/GPT-4o Coder/i)).toBeVisible();
  });

  test("confirming delete shows success toast", async ({ page }) => {
    await page.route(`**/agent-profiles/${data.agentProfileId}`, async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: "Agent Profiles" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: `Delete GPT-4o Coder` }).click();

    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();

    // Click the confirm Delete button inside the dialog
    await confirmDialog.getByRole("button", { name: /^delete$/i }).click();

    await expect(page.getByText(/agent profile deleted/i)).toBeVisible({ timeout: 6_000 });
  });
});
