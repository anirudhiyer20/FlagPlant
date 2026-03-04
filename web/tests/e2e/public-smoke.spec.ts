import { expect, test } from "@playwright/test";

test.describe("Public Smoke", () => {
  test("home page renders core hero content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FlagPlant" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start With 100 Flags" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore Leaderboard" })).toBeVisible();
  });

  test("auth page loads sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Auth" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("protected pages show sign-in guidance when signed out", async ({ page }) => {
    await page.goto("/flag-market");
    await expect(page.getByRole("heading", { name: "Flag Market" })).toBeVisible();
    await expect(
      page.getByText("Sign in from the top-right navigation button to access this page")
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await expect(
      page.getByText("Sign in from the top-right navigation button to access this page")
    ).toBeVisible({ timeout: 15_000 });
  });
});

