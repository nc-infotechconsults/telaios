import { test, expect } from "@playwright/test";
import { loadCIData } from "./global-setup";

/**
 * TaskDetailModal E2E tests.
 *
 * Run against the real backend stack (data-api + agent-service).
 * Test data is seeded in global-setup.ts:
 *
 * executingProject — plan with 5 tasks:
 *   t1: "Extract Auth Service"                     — done,        order 0, agent "GPT-4o Coder", repos [auth-service]
 *   t2: "Extract Product Catalog Service"           — done,        order 1, repos [api-service]
 *   t3: "Extract Order Management Service"          — in_progress, order 2, depends [t1, t2]
 *   t4: "Integration & Regression Tests"            — pending,     order 3, depends [t2, t3]
 *   t5: "Traffic Cutover & Decommission Monolith"   — pending,     order 4, depends [t4]
 */

const data = loadCIData();

async function goToListView(page: import("@playwright/test").Page) {
  await page.goto(`/projects/${data.executingProjectId}/execute`);
  await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
  const viewGroup = page.getByRole("group", { name: "Plan view" });
  await viewGroup.getByText("List").click();
  await expect(page.locator("ul li")).toHaveCount(5);
}

test.describe("TaskDetailModal — basic open/close", () => {
  test.beforeEach(async ({ page }) => {
    await goToListView(page);
  });

  test("opens modal when clicking a task in list view", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Extract Auth Service")).toBeVisible();
  });

  test("modal shows status chip", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Done")).toBeVisible();
  });

  test("modal shows task description", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText("Move authentication logic into a standalone service", { exact: false })
    ).toBeVisible();
  });

  test("modal shows task type chip", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Type")).toBeVisible();
    await expect(modal.getByText("code").first()).toBeVisible();
  });

  test("modal shows execution order", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Execution order")).toBeVisible();
    await expect(modal.getByText("#0")).toBeVisible();
  });

  test("modal shows agent profile info", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Agent")).toBeVisible();
    await expect(modal.getByText("langgraph")).toBeVisible();
    await expect(modal.getByText("GPT-4o Coder")).toBeVisible();
  });

  test("modal shows repository chips", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Repositories")).toBeVisible();
    await expect(modal.getByText("auth-service", { exact: false })).toBeVisible();
  });

  test("closes modal via Escape key", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });
});

test.describe("TaskDetailModal — dependency navigation", () => {
  test.beforeEach(async ({ page }) => {
    await goToListView(page);
  });

  test("shows dependency links for task with dependencies", async ({ page }) => {
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Depends on")).toBeVisible();
    await expect(modal.getByText("Extract Auth Service", { exact: false })).toBeVisible();
    await expect(modal.getByText("Extract Product Catalog Service", { exact: false })).toBeVisible();
  });

  test("shows unlocks section for task with downstream tasks", async ({ page }) => {
    await page.getByText("Extract Product Catalog Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Unlocks")).toBeVisible();
  });

  test("clicking a dependency navigates to that task in the modal", async ({ page }) => {
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    const depButton = modal.locator("button").filter({ hasText: "Extract Auth Service" });
    await depButton.click();

    await expect(modal.getByText("#0")).toBeVisible();
    await expect(modal.getByText("Done")).toBeVisible();
  });

  test("task with no dependencies does not show Depends on section", async ({ page }) => {
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Depends on")).not.toBeVisible();
  });
});

test.describe("TaskDetailModal — artifacts section", () => {
  test("shows artifacts section for terminal (done) tasks", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts", { exact: true })).toBeVisible();
    await expect(modal.getByText("No artifacts recorded for this task.")).toBeVisible();
  });

  test("does not show artifacts section for non-terminal (in_progress) tasks", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts")).not.toBeVisible();
  });

  test("does not show artifacts section for pending tasks", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts")).not.toBeVisible();
  });
});

test.describe("TaskDetailModal — completed plan", () => {
  test("opens modal for completed plan tasks and shows artifacts section", async ({ page }) => {
    await page.goto(`/projects/${data.completedProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();
    await expect(page.locator("ul li")).toHaveCount(3);

    await page.getByText("Design Airflow DAG topology").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Done")).toBeVisible();
    await expect(modal.getByText("Artifacts", { exact: true })).toBeVisible();
    await expect(modal.getByText("No artifacts recorded for this task.")).toBeVisible();
  });
});

