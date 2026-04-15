import { test, expect } from "@playwright/test";

/**
 * Plan operations E2E tests.
 *
 * Tests Cancel plan, task-level Retry/Cancel interactions, and view toggle.
 *
 * Runs in demo mode. In demo mode:
 * - cancelPlan returns { cancelled: 0 } after 300ms delay
 * - retryTask / cancelTask return a stub updated task after 300ms
 * - resumePlan does a POST but returns {} — no state change
 * - Route mocking via page.route() does NOT work because demo mode
 *   returns in-memory data without making HTTP requests.
 *
 * Therefore tests verify button visibility and that clicks don't crash,
 * but cannot test state transitions that require real API responses.
 */

/** Navigate to demo-1 execution dashboard and switch to list view */
async function goToListView(page: import("@playwright/test").Page) {
  await page.goto("/projects/demo-1/execute");
  await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
  const viewGroup = page.getByRole("group", { name: "Plan view" });
  await viewGroup.getByText("List").click();
  await expect(page.locator("ul li")).toHaveCount(5);
}

test.describe("Plan-level controls", () => {
  test("Cancel plan button is visible for executing plan", async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel plan" })).toBeVisible();
  });

  test("clicking Cancel plan does not crash the page", async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    const cancelBtn = page.getByRole("button", { name: "Cancel plan" });
    await cancelBtn.click();
    // Page should remain on the dashboard (no navigation, no crash)
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });

  test("Resume button is NOT visible for executing plan", async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });

  test("neither Cancel plan nor Resume shown for completed plan", async ({ page }) => {
    await page.goto("/projects/demo-3/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel plan" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });
});

test.describe("Task-level inline controls (list view)", () => {
  test("Cancel buttons appear for pending tasks", async ({ page }) => {
    await goToListView(page);
    // t4 and t5 are pending — should have cancel buttons
    const cancelButtons = page.locator("button[title='Cancel task']");
    await expect(cancelButtons).toHaveCount(2);
  });

  test("clicking inline Cancel task does not crash", async ({ page }) => {
    await goToListView(page);
    const cancelButtons = page.locator("button[title='Cancel task']");
    await cancelButtons.first().click();
    // Page should not crash — dashboard remains visible
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });

  test("no Retry buttons in executing plan (no failed tasks)", async ({ page }) => {
    await goToListView(page);
    await expect(page.locator("button[title='Retry task']")).toHaveCount(0);
  });

  test("no inline Cancel buttons for done or in_progress tasks", async ({ page }) => {
    await goToListView(page);
    // Only 2 Cancel buttons total (for t4 and t5, both pending)
    // done (t1, t2) and in_progress (t3) should not have Cancel buttons
    const cancelButtons = page.locator("button[title='Cancel task']");
    await expect(cancelButtons).toHaveCount(2);
  });
});

test.describe("Task-level modal controls", () => {
  test("modal shows Cancel task button for pending task", async ({ page }) => {
    await goToListView(page);
    // Open t4 (pending) → modal should have Cancel task button in footer
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).toBeVisible();
    // No Retry button for pending tasks
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
  });

  test("modal does NOT show action buttons for done tasks", async ({ page }) => {
    await goToListView(page);
    // Open t1 (done) → no Retry or Cancel in footer
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).not.toBeVisible();
  });

  test("modal does NOT show action buttons for in_progress tasks", async ({ page }) => {
    await goToListView(page);
    // Open t3 (in_progress) → no Retry or Cancel
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).not.toBeVisible();
  });

  test("clicking Cancel task in modal does not crash", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Cancel task" }).click();
    // Should not crash — modal or dashboard remains visible
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });
});

test.describe("View toggle persistence within session", () => {
  test("switching between Graph and List toggles aria-pressed", async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });

    const viewGroup = page.getByRole("group", { name: "Plan view" });
    const graphBtn = viewGroup.getByText("Graph");
    const listBtn = viewGroup.getByText("List");

    // Default: Graph is pressed
    await expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    await expect(listBtn).toHaveAttribute("aria-pressed", "false");

    // Switch to List
    await listBtn.click();
    await expect(graphBtn).toHaveAttribute("aria-pressed", "false");
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");

    // Switch back to Graph
    await graphBtn.click();
    await expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    await expect(listBtn).toHaveAttribute("aria-pressed", "false");
  });
});
