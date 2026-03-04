import { expect, test, type Page } from "@playwright/test";

const testEmail = process.env.E2E_TEST_EMAIL;
const testPassword = process.env.E2E_TEST_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/auth");

  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
    await expect(page).toHaveURL(/\/auth/);
  }

  await page.getByLabel("Email").fill(testEmail ?? "");
  await page.getByLabel("Password").fill(testPassword ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  const authError = page.locator("p.error");
  const signInFailed = authError
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(async () => {
      const message = (await authError.first().innerText()).trim();
      throw new Error(
        `E2E auth sign-in failed: ${message || "unknown error shown on /auth"}`
      );
    });

  const dashboardLoaded = page.waitForURL(/\/dashboard/, { timeout: 12_000 });
  await Promise.race([dashboardLoaded, signInFailed]);
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Authenticated Smoke", () => {
  test.skip(
    !testEmail || !testPassword,
    "Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD."
  );

  test("login and load dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible();
    await expect(page.getByText("Voting Status")).toBeVisible();
  });

  test("submit or edit daily opinion and verify saved state", async ({ page }) => {
    await signIn(page);
    await page.goto("/ball-knowledge");
    await expect(page.getByRole("heading", { name: "Ball Knowledge" })).toBeVisible();

    const uniqueOpinion = `E2E opinion ${new Date().toISOString()}`;
    const submitButton = page.getByRole("button", { name: "Submit Opinion" });
    const editSubmittedButton = page.getByRole("button", {
      name: "Edit Submitted Opinion"
    });

    // Wait until opinion state finishes loading and one action is available.
    await expect
      .poll(
        async () =>
          (await submitButton.isVisible().catch(() => false)) ||
          (await editSubmittedButton.isVisible().catch(() => false)),
        { timeout: 15_000 }
      )
      .toBeTruthy();

    if (await submitButton.isVisible().catch(() => false)) {
      await page.getByLabel("Daily Opinion").fill(uniqueOpinion);
      await submitButton.click();
    } else {
      await expect(editSubmittedButton).toBeVisible();
      await editSubmittedButton.click();
      await expect(page.getByRole("button", { name: "Save Edit" })).toBeVisible();
      await page.getByLabel("Edit Submitted Opinion").fill(uniqueOpinion);
      await page.getByRole("button", { name: "Save Edit" }).click();
    }

    await expect(page.getByText(uniqueOpinion)).toBeVisible();
    await expect(editSubmittedButton).toBeVisible();
  });
});
