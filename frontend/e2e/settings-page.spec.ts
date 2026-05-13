import { expect, test } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "System Settings" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("saves settings and applies branding in the shell", async ({ page }) => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const brandName = `E2E Brand ${uniqueSuffix}`;
    const brandColor = "#0C8A4A";

    await page.getByPlaceholder("TelaiOS").fill(brandName);
    await page.getByPlaceholder("#006FEE").fill(brandColor);

    await page
      .getByRole("button", { name: "Save Settings" })
      .click();

    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");

    await expect(page.getByText(brandName).first()).toBeVisible({ timeout: 10_000 });

    const title = await page.title();
    expect(title).toBe(brandName);

    const rootPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim(),
    );
    expect(rootPrimary).toBe(brandColor);
  });

  test("accepts logo upload and shows it in topbar after save", async ({ page }) => {
    const logoDataUrl =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc5NicgaGVpZ2h0PSczMicgdmlld0JveD0nMCAwIDk2IDMyJz48cmVjdCB3aWR0aD0nOTYnIGhlaWdodD0nMzInIHJ4PSc4JyBmaWxsPScjMEQ5N0Y2Jy8+PHRleHQgeD0nNDgnIHk9JzIxJyB0ZXh0LWFuY2hvcj0nbWlkZGxlJyBmb250LXNpemU9JzEyJyBmb250LWZhbWlseT0nc2Fucy1zZXJpZicgZmlsbD0nd2hpdGUnPkUyRSBMT0dPPC90ZXh0Pjwvc3ZnPg==";

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
