import { expect, test } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15_000 });
  });

  test("saves branding and applies accent + name in the shell", async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const brandName = `E2E Brand ${suffix}`;
    const brandColor = "#0c8a4a";

    await page.getByPlaceholder("TelaiOS").fill(brandName);
    await page.getByPlaceholder("#0a84ff").fill(brandColor);
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    await expect(page.getByText(brandName).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toBe(brandName);

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent-1").trim(),
    );
    expect(accent.toLowerCase()).toBe(brandColor);
  });

  test("applies a preset palette to glass-shell vars", async ({ page }) => {
    await page.getByText("Appearance").click();
    await page.getByRole("button", { name: "Corporate" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toLowerCase(),
    );
    expect(bg).toBe("#ffffff");
  });

  test("changes the density attribute on the root", async ({ page }) => {
    await page.getByText("Appearance").click();
    await page.getByRole("button", { name: "compact", exact: true }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    const density = await page.evaluate(() =>
      document.documentElement.getAttribute("data-density"),
    );
    expect(density).toBe("compact");
  });

  test("accepts logo upload and shows it after save", async ({ page }) => {
    const logoDataUrl =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc5NicgaGVpZ2h0PSczMicgdmlld0JveD0nMCAwIDk2IDMyJz48cmVjdCB3aWR0aD0nOTYnIGhlaWdodD0nMzInIHJ4PSc4JyBmaWxsPScjMEQ5N0Y2Jy8+PC9zdmc+";
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles({
      name: "e2e-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(logoDataUrl.split(",")[1], "base64"),
    });
    await expect(page.getByAltText("Preview")).toBeVisible();
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    await expect(page.getByAltText(/logo$/i)).toBeVisible({ timeout: 10_000 });
  });
});
