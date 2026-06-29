import { test, expect } from "@playwright/test";

/**
 * Public-page smoke tests — no auth/DB writes, just that the critical
 * unauthenticated surfaces render. Run against a live app via PLAYWRIGHT_BASE_URL.
 */
test.describe("public pages", () => {
  test("sign-in renders the split-screen + form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByText(/turn cold leads into booked calls/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });

  test("sign-up renders the create-workspace form", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create your workspace/i })).toBeVisible();
  });

  test("forgot-password renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
  });

  test("unknown route shows the branded 404", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test("protected route redirects to sign-in", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
