import { type Page, expect } from "@playwright/test";

const LOCALE = process.env.E2E_LOCALE || "zh";

/**
 * Wait for all in-flight async tasks (spinners / progress indicators) to disappear.
 * Uses the animate-spin class that every loader in the app shares.
 */
export async function waitForTaskComplete(
  page: Page,
  options?: { timeout?: number; pollInterval?: number },
) {
  const timeout = options?.timeout ?? 300_000; // 5 minutes default
  const pollInterval = options?.pollInterval ?? 3_000;
  const deadline = Date.now() + timeout;

  // First wait a bit for the task to actually start (spinner to appear)
  await page.waitForTimeout(2_000);

  // Then poll until no spinners remain
  while (Date.now() < deadline) {
    const spinners = await page.locator(".animate-spin").count();
    if (spinners === 0) {
      // Double-check after a short delay (tasks might chain)
      await page.waitForTimeout(1_000);
      const recheck = await page.locator(".animate-spin").count();
      if (recheck === 0) return;
    }
    await page.waitForTimeout(pollInterval);
  }
  throw new Error(`Tasks did not complete within ${timeout}ms`);
}

/**
 * Wait specifically for toast messages that indicate task completion or failure.
 */
export async function waitForToast(
  page: Page,
  textPattern: string | RegExp,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? 300_000;
  await page.getByText(textPattern).first().waitFor({ state: "visible", timeout });
}

/**
 * Log in via the credentials form.
 */
export async function login(page: Page, email?: string, password?: string) {
  const e = email ?? process.env.E2E_EMAIL ?? "e2e-test@jimeaning.local";
  const p = password ?? process.env.E2E_PASSWORD ?? "e2eTest123456";

  await page.goto(`/${LOCALE}/auth/signin`);
  await page.locator("input#email").fill(e);
  await page.locator("input#password").fill(p);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from signin
  await page.waitForURL((url) => !url.pathname.includes("/auth/signin"), {
    timeout: 30_000,
  });
}

/**
 * Ensure the E2E test user exists by calling the register API directly.
 * Silently ignores 409 (already exists).
 */
export async function ensureTestUser(baseURL: string) {
  const email = process.env.E2E_EMAIL ?? "e2e-test@jimeaning.local";
  const password = process.env.E2E_PASSWORD ?? "e2eTest123456";

  const res = await fetch(`${baseURL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "E2E Test" }),
  });

  if (res.ok) {
    console.log(`  Test user created: ${email}`);
  } else if (res.status === 409) {
    console.log(`  Test user already exists: ${email}`);
  } else {
    throw new Error(
      `Failed to ensure test user (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Navigate to a specific tab in the project workspace.
 */
export async function switchTab(page: Page, tabKey: "script" | "assets" | "storyboard" | "voice" | "compose") {
  const tabLabels: Record<string, string> = {
    script: "剧本",
    assets: "素材",
    storyboard: "分镜",
    voice: "配音",
    compose: "合成",
  };
  await page.getByRole("button", { name: tabLabels[tabKey] }).click();
  await page.waitForTimeout(500);
}

/**
 * Click a button by its Chinese text label.
 */
export async function clickButton(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
}

/**
 * Refresh project data by clicking the "刷新" button if visible.
 */
export async function refreshProject(page: Page) {
  const btn = page.getByRole("button", { name: "刷新" });
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(1_000);
  }
}

/**
 * Wait for an agent project's status badge to change to the target text.
 * Polls by reloading the page periodically.
 */
export async function waitForStatusChange(
  page: Page,
  projectTitle: string,
  targetStatus: string | RegExp,
  options?: { timeout?: number; pollInterval?: number },
) {
  const timeout = options?.timeout ?? 600_000;
  const pollInterval = options?.pollInterval ?? 5_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Find the project card containing the title
    const card = page.locator("div").filter({ hasText: projectTitle }).first();
    const badge = card.locator("span").filter({ hasText: targetStatus });
    if ((await badge.count()) > 0) {
      return;
    }
    await page.waitForTimeout(pollInterval);
    await page.reload();
    await page.waitForTimeout(2_000);
  }
  throw new Error(
    `Status did not change to "${targetStatus}" within ${timeout}ms`,
  );
}

/**
 * Fill a textarea reliably — clears first, then fills.
 */
export async function fillTextarea(
  page: Page,
  selector: string,
  text: string,
) {
  const textarea = page.locator(selector);
  await textarea.click();
  await textarea.fill(text);
}

/**
 * Wait for a specific API response and return it.
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? 30_000;
  return page.waitForResponse(
    (resp) => {
      const url = resp.url();
      if (typeof urlPattern === "string") return url.includes(urlPattern);
      return urlPattern.test(url);
    },
    { timeout },
  );
}

/**
 * Check for error toast and throw if found.
 */
export async function assertNoErrorToast(page: Page) {
  await page.waitForTimeout(2_000);
  const errorToast = page
    .locator('[class*="toast"]')
    .filter({ hasText: /失败|错误|配置/ });
  if ((await errorToast.count()) > 0) {
    const msg = await errorToast.first().textContent();
    throw new Error(`Unexpected error toast: ${msg}`);
  }
}
