import { test, expect } from "@playwright/test";

/**
 * ExecutionDashboard E2E tests.
 *
 * Run against Vite dev server in demo mode (VITE_DEMO_MODE=true).
 *
 * Demo project "demo-1" has an executing plan (plan-1) with 5 tasks:
 *   t1: "Extract Auth Service"                     — done,        order 0
 *   t2: "Extract Product Catalog Service"           — done,        order 1
 *   t3: "Extract Order Management Service"          — in_progress, order 2
 *   t4: "Integration & Regression Tests"            — pending,     order 3
 *   t5: "Traffic Cutover & Decommission Monolith"   — pending,     order 4
 *
 * Demo project "demo-2" has only a draft plan → empty state.
 * Demo project "demo-3" has a completed plan (plan-3) with 3 done tasks.
 */

test.describe("ExecutionDashboard — active executing plan", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
  });

  test("renders the page heading and back navigation", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Execution Dashboard" }).or(page.getByText("Execution Dashboard"))
    ).toBeVisible();
    const backButton = page.getByLabel("Back to planning chat");
    await expect(backButton).toBeVisible();
    await expect(backButton).toHaveText("← Planning");
  });

  test("shows the plan status chip as Executing", async ({ page }) => {
    await expect(page.getByText("Executing").first()).toBeVisible();
  });

  test("displays task statistics chips", async ({ page }) => {
    // 2 done out of 5 total
    await expect(page.getByText("2/5 done")).toBeVisible();
    // 1 task in_progress
    await expect(page.getByText("1 running")).toBeVisible();
  });

  test("shows the progress bar with correct percentage", async ({ page }) => {
    // 2/5 = 40%
    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "40");
    await expect(progressBar).toHaveAttribute("aria-label", "Execution progress: 40%");
  });

  test("shows Cancel plan button for executing plan", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Cancel plan" })).toBeVisible();
  });

  test("does not show Resume button for executing plan", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });

  test("displays repository status banners", async ({ page }) => {
    // demo-1 has 3 repos: api-service, auth-service, infra-scripts — all "ready"
    await expect(page.getByText("api-service").first()).toBeVisible();
    await expect(page.getByText("auth-service").first()).toBeVisible();
    await expect(page.getByText("infra-scripts").first()).toBeVisible();
  });

  test("shows Graph/List view toggle group", async ({ page }) => {
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await expect(viewGroup).toBeVisible();
    await expect(viewGroup.getByText("Graph")).toBeVisible();
    await expect(viewGroup.getByText("List")).toBeVisible();
  });

  test("switches to list view and shows all 5 tasks", async ({ page }) => {
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();

    // All 5 task titles should be visible
    await expect(page.getByText("Extract Auth Service")).toBeVisible();
    await expect(page.getByText("Extract Product Catalog Service")).toBeVisible();
    await expect(page.getByText("Extract Order Management Service")).toBeVisible();
    await expect(page.getByText("Integration & Regression Tests")).toBeVisible();
    await expect(page.getByText("Traffic Cutover & Decommission Monolith")).toBeVisible();
  });

  test("list view renders correct number of task rows", async ({ page }) => {
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();
    const listItems = page.locator("ul li");
    await expect(listItems).toHaveCount(5);
  });

  test("list view shows no Retry buttons (no failed tasks)", async ({ page }) => {
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();
    await expect(page.locator("button[title='Retry task']")).toHaveCount(0);
  });

  test("list view shows inline Cancel buttons for pending tasks", async ({ page }) => {
    const viewGroup = page.getByRole("group", { name: "Plan view" });
    await viewGroup.getByText("List").click();
    // t4 (pending) and t5 (pending) should have Cancel buttons
    const cancelButtons = page.locator("button[title='Cancel task']");
    await expect(cancelButtons).toHaveCount(2);
  });

  test("back button navigates to project detail page", async ({ page }) => {
    await page.getByLabel("Back to planning chat").click();
    await expect(page).toHaveURL(/\/projects\/demo-1$/);
  });
});

test.describe("ExecutionDashboard — empty state (no active plan)", () => {
  test("shows empty state when project has only draft plans", async ({ page }) => {
    await page.goto("/projects/demo-2/execute");
    await expect(
      page.getByText("No tasks yet. Confirm a plan in the planning chat to start execution.")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Go to Planning" })).toBeVisible();
  });

  test("Go to Planning button navigates back", async ({ page }) => {
    await page.goto("/projects/demo-2/execute");
    await expect(page.getByRole("button", { name: "Go to Planning" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Go to Planning" }).click();
    await expect(page).toHaveURL(/\/projects\/demo-2$/);
  });
});

test.describe("ExecutionDashboard — completed plan", () => {
  test("shows completed status and 100% progress", async ({ page }) => {
    await page.goto("/projects/demo-3/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("3/3 done")).toBeVisible();

    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    await expect(progressBar).toHaveAttribute("aria-label", "Execution progress: 100%");
  });

  test("does not show Cancel plan or Resume buttons for completed plan", async ({ page }) => {
    await page.goto("/projects/demo-3/execute");
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel plan" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });
});

test.describe("ExecutionDashboard — demo banner", () => {
  test("shows demo mode banner", async ({ page }) => {
    await page.goto("/projects/demo-1/execute");
    await expect(page.getByText("Demo mode")).toBeVisible({ timeout: 15_000 });
  });
});
