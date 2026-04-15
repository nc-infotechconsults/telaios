import { test, expect } from "@playwright/test";

/**
 * TaskDetailModal E2E tests.
 *
 * Tests the modal that opens when clicking a task in list view.
 * Uses demo-1 (executing plan-1, 5 tasks) and demo-3 (completed plan-3, 3 tasks).
 *
 * plan-1 tasks:
 *   t1: "Extract Auth Service"                     — done,        order 0, agent ap1, repos [r2]
 *   t2: "Extract Product Catalog Service"           — done,        order 1, agent ap1, repos [r1]
 *   t3: "Extract Order Management Service"          — in_progress, order 2, agent ap1, repos [r1], depends [t1,t2]
 *   t4: "Integration & Regression Tests"            — pending,     order 3, agent ap2, repos [r1,r2], depends [t2,t3]
 *   t5: "Traffic Cutover & Decommission Monolith"   — pending,     order 4, agent ap1, repos [r1], depends [t4]
 *
 * Demo mode returns empty arrays for getTaskArtifacts, so artifact sections
 * show "No artifacts recorded for this task." for terminal tasks.
 */

/** Navigate to demo-1 execution dashboard and switch to list view */
async function goToListView(page: import("@playwright/test").Page) {
  await page.goto("/projects/demo-1/execute");
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
    // t1 status is "done" → formatStatus → "Done"
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
    // t1 has agent_profile_id "ap1" → "GPT-4o Coder", agent_type "langgraph"
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Agent")).toBeVisible();
    await expect(modal.getByText("langgraph")).toBeVisible();
    await expect(modal.getByText("GPT-4o Coder")).toBeVisible();
  });

  test("modal shows repository chips", async ({ page }) => {
    // t1 repository_ids: ["r2"] = "auth-service"
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
    // t3 depends on t1 and t2
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Depends on")).toBeVisible();
    await expect(modal.getByText("Extract Auth Service", { exact: false })).toBeVisible();
    await expect(modal.getByText("Extract Product Catalog Service", { exact: false })).toBeVisible();
  });

  test("shows unlocks section for task with downstream tasks", async ({ page }) => {
    // t2 unlocks t3 (depends on t1,t2) and t4 (depends on t2,t3)
    await page.getByText("Extract Product Catalog Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Unlocks")).toBeVisible();
  });

  test("clicking a dependency navigates to that task in the modal", async ({ page }) => {
    // Open t3, click on dependency t1 ("Extract Auth Service")
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    const depButton = modal.locator("button").filter({ hasText: "Extract Auth Service" });
    await depButton.click();

    // Modal should now show t1's details — execution_order #0, status Done
    await expect(modal.getByText("#0")).toBeVisible();
    await expect(modal.getByText("Done")).toBeVisible();
  });

  test("task with no dependencies does not show Depends on section", async ({ page }) => {
    // t1 has no dependencies
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Depends on")).not.toBeVisible();
  });
});

test.describe("TaskDetailModal — artifacts section", () => {
  test("shows artifacts section for terminal (done) tasks", async ({ page }) => {
    await goToListView(page);
    // t1 is "done" — terminal status, artifacts section appears
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts", { exact: true })).toBeVisible();
    // Demo mode returns empty array for getTaskArtifacts — wait for loading to finish
    await expect(modal.getByText("No artifacts recorded for this task.")).toBeVisible();
  });

  test("does not show artifacts section for non-terminal (in_progress) tasks", async ({ page }) => {
    await goToListView(page);
    // t3 is "in_progress" — not terminal, no artifacts section
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts")).not.toBeVisible();
  });

  test("does not show artifacts section for pending tasks", async ({ page }) => {
    await goToListView(page);
    // t4 is "pending" — not terminal
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Artifacts")).not.toBeVisible();
  });
});

test.describe("TaskDetailModal — completed plan (demo-3)", () => {
  test("opens modal for completed plan tasks and shows artifacts section", async ({ page }) => {
    await page.goto("/projects/demo-3/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();
    await expect(page.locator("ul li")).toHaveCount(3);

    // Open first task: "Design Airflow DAG topology"
    await page.getByText("Design Airflow DAG topology").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Done")).toBeVisible();
    await expect(modal.getByText("Artifacts", { exact: true })).toBeVisible();
    await expect(modal.getByText("No artifacts recorded for this task.")).toBeVisible();
  });
});
