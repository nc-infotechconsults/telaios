import { test, expect } from "@playwright/test";
import { loadCIData } from "./global-setup";

/**
 * Plan operations E2E tests.
 *
 * Run against the real backend stack (data-api + agent-service).
 * Test data is seeded in global-setup.ts.
 *
 * Tests that click "Cancel plan" or "Cancel task" use page.route() to
 * intercept the corresponding API calls so they do not mutate the shared
 * database state and break subsequent tests.
 */

const data = loadCIData();

async function goToListView(page: import("@playwright/test").Page) {
  await page.goto(`/projects/${data.executingProjectId}/execute`);
  await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
  const viewGroup = page.getByRole("group", { name: "Plan view" });
  await viewGroup.getByText("List").click();
  await expect(page.locator("ul li")).toHaveCount(5);
}

test.describe("Plan-level controls", () => {
  test("Cancel plan button is visible for executing plan", async ({ page }) => {
    await page.goto(`/projects/${data.executingProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel plan" })).toBeVisible();
  });

  test("clicking Cancel plan does not crash the page", async ({ page }) => {
    // Intercept to prevent real state change in the shared test DB
    await page.route("**/api/plans/*/cancel", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cancelled: 2 }) })
    );
    await page.goto(`/projects/${data.executingProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    const cancelBtn = page.getByRole("button", { name: "Cancel plan" });
    await cancelBtn.click();
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });

  test("Resume button is NOT visible for executing plan", async ({ page }) => {
    await page.goto(`/projects/${data.executingProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });

  test("neither Cancel plan nor Resume shown for completed plan", async ({ page }) => {
    await page.goto(`/projects/${data.completedProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Cancel plan" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).not.toBeVisible();
  });
});

test.describe("Task-level inline controls (list view)", () => {
  test("Cancel buttons appear for pending tasks", async ({ page }) => {
    await goToListView(page);
    const cancelButtons = page.locator("button[title='Cancel task']");
    await expect(cancelButtons).toHaveCount(2);
  });

  test("clicking inline Cancel task does not crash", async ({ page }) => {
    await page.route("**/api/tasks/*/cancel", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: data.t4Id, status: "cancelled" }),
      })
    );
    await goToListView(page);
    const cancelButtons = page.locator("button[title='Cancel task']");
    await cancelButtons.first().click();
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });

  test("no Retry buttons in executing plan (no failed tasks)", async ({ page }) => {
    await goToListView(page);
    await expect(page.locator("button[title='Retry task']")).toHaveCount(0);
  });

  test("no inline Cancel buttons for done or in_progress tasks", async ({ page }) => {
    await goToListView(page);
    const cancelButtons = page.locator("button[title='Cancel task']");
    await expect(cancelButtons).toHaveCount(2);
  });
});

test.describe("Task-level modal controls", () => {
  test("modal shows Cancel task button for pending task", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
  });

  test("modal does NOT show action buttons for done tasks", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Extract Auth Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).not.toBeVisible();
  });

  test("modal does NOT show action buttons for in_progress tasks", async ({ page }) => {
    await goToListView(page);
    await page.getByText("Extract Order Management Service").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Retry" })).not.toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel task" })).not.toBeVisible();
  });

  test("clicking Cancel task in modal does not crash", async ({ page }) => {
    await page.route("**/api/tasks/*/cancel", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: data.t4Id, status: "cancelled" }),
      })
    );
    await goToListView(page);
    await page.getByText("Integration & Regression Tests").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Cancel task" }).click();
    await expect(page.getByText("Execution Dashboard")).toBeVisible();
  });
});

test.describe("View toggle persistence within session", () => {
  test("switching between Graph and List toggles aria-pressed", async ({ page }) => {
    await page.goto(`/projects/${data.executingProjectId}/execute`);
    await expect(page.getByText("Execution Dashboard")).toBeVisible({ timeout: 15_000 });

    const viewGroup = page.getByRole("group", { name: "Plan view" });
    const graphBtn = viewGroup.getByText("Graph");
    const listBtn = viewGroup.getByText("List");

    await expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    await expect(listBtn).toHaveAttribute("aria-pressed", "false");

    await listBtn.click();
    await expect(graphBtn).toHaveAttribute("aria-pressed", "false");
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");

    await graphBtn.click();
    await expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    await expect(listBtn).toHaveAttribute("aria-pressed", "false");
  });
});

