import { test, expect, type Page } from "@playwright/test";
import {
  login,
  waitForTaskComplete,
  assertNoErrorToast,
} from "./helpers";

const LOCALE = process.env.E2E_LOCALE || "zh";

// Short novel text with named characters and clear plot for 2-3 episodes
const TEST_NOVEL = `第一章 初遇

林晓从咖啡店出来，迎面撞上了一个穿白衬衫的男人。咖啡洒了一地。
"对不起！"她慌忙道歉。
男人蹲下来帮她捡东西，抬头一笑："没关系，我叫陈默。"
那天的阳光很好，林晓不知道，这个偶遇会改变她的一生。
她回到公司，心里还在想着那个温暖的笑容。同事小张问她怎么了，她摇摇头说没事。
中午吃饭的时候，小张突然说："你知道吗，隔壁部门来了个新主管，听说长得特别帅。"
林晓没放在心上，低头继续吃饭。

第二章 重逢

一个月后，林晓在新公司报到。推开办公室的门，她愣住了——坐在主管位置上的人，正是陈默。
"林小姐，我们又见面了。"陈默放下文件，嘴角微扬。
林晓心里一紧，她不喜欢这种被命运捉弄的感觉。
接下来的日子里，两人保持着客气而疏远的距离。直到一次团建活动，陈默主动坐到她身边。
"林小姐，你总是躲着我。"他低声说。
"没有，是你想多了。"她端起杯子，掩饰着慌乱。
小张在旁边偷笑，还拿手机拍了一张照片。

第三章 转折

项目截止日前三天，系统突然崩溃。整个团队加班到凌晨三点。
林晓累得趴在桌上，醒来时发现身上多了一件外套。陈默坐在对面，盯着屏幕敲代码。
"你不用管我。"她小声说。
"管你是主管的职责。"他头也不抬。
林晓望着他的侧脸，忽然觉得，也许被命运捉弄并不全是坏事。
项目最终顺利上线，庆功宴上，陈默举杯对她说："感谢你的坚持。"
她笑了，第一次觉得自己做对了选择。`;

const TIMESTAMP = Date.now();

/**
 * Expand a project card by clicking the toggle button that contains the title.
 * Returns the Card container (parent of the toggle button).
 */
async function expandProject(page: Page, title: string) {
  // The toggle button contains the project title text
  const toggleBtn = page.locator("button").filter({ hasText: title }).first();
  await toggleBtn.click();
  await page.waitForTimeout(1_000);
}

/**
 * Wait for a project's status badge to show the target text.
 * Uses gentle polling — waits longer between reloads to avoid overwhelming the server.
 * Also checks for "失败" status to fail fast.
 */
async function waitForProjectStatus(
  page: Page,
  title: string,
  targetStatus: string | RegExp,
  options?: { timeout?: number; pollInterval?: number },
) {
  const timeout = options?.timeout ?? 600_000;
  const pollInterval = options?.pollInterval ?? 30_000; // 30s default — gentle on server
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Wait before checking (let the server work)
    await page.waitForTimeout(pollInterval);

    // Reload and wait for page to fully load
    await page.goto(`/${process.env.E2E_LOCALE || "zh"}/agents`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    const toggleBtn = page.locator("button").filter({ hasText: title }).first();
    if ((await toggleBtn.count()) === 0) continue;

    // Check for target status
    const badge = toggleBtn.locator("span").filter({ hasText: targetStatus });
    if ((await badge.count()) > 0) {
      return;
    }

    // Fail fast if status is "失败"
    const failBadge = toggleBtn.locator("span").filter({ hasText: "失败" });
    if ((await failBadge.count()) > 0) {
      throw new Error(`Project "${title}" failed — status shows "失败"`);
    }
  }
  throw new Error(
    `Project "${title}" status did not change to "${targetStatus}" within ${timeout}ms`,
  );
}

test.describe.serial("Agent工坊完整流程", () => {
  const novelProjectTitle = `E2E小说_${TIMESTAMP}`;
  const autoProjectTitle = `E2E自动_${TIMESTAMP}`;

  test("1. 登录并访问Agent工坊", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expect(
      page.locator("h1").filter({ hasText: "Agent 工坊" }),
    ).toBeVisible();
  });

  test("2. 创建小说洗稿项目", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    // Click "新建改编项目"
    await page.getByRole("button", { name: "新建改编项目" }).click();
    await page.waitForTimeout(1_000);

    // Fill title
    await page.locator("input#title").fill(novelProjectTitle);

    // Fill source text
    const textarea = page.locator("textarea").first();
    await textarea.fill(TEST_NOVEL);

    // Select "小说洗稿" format — scope to form to avoid matching project cards
    const form = page.locator("form").first();
    await form.getByRole("button", { name: "小说洗稿", exact: true }).click();
    await page.waitForTimeout(500);

    // Uncheck auto mode if checked
    const autoCheckbox = page.locator('input[type="checkbox"]').first();
    if (await autoCheckbox.isChecked()) {
      await autoCheckbox.uncheck();
    }

    // Submit
    await page.locator('button[type="submit"]').filter({ hasText: "创建" }).click();
    await page.waitForTimeout(3_000);

    // Verify project appears
    await expect(page.getByText(novelProjectTitle).first()).toBeVisible({
      timeout: 10_000,
    });
    // Verify status badge (待开始 or 分析中 if auto-triggered)
    const projectBtn = page.locator("button").filter({ hasText: novelProjectTitle }).first();
    await expect(
      projectBtn.locator("span").filter({ hasText: /待开始|分析中|已分析/ }).first(),
    ).toBeVisible();
  });

  test("3. 分析原著", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    // Check if already analyzed (auto mode might have started)
    const projectBtn = page.locator("button").filter({ hasText: novelProjectTitle }).first();
    const alreadyAnalyzed = await projectBtn.locator("span").filter({ hasText: "已分析" }).count();
    if (alreadyAnalyzed > 0) {
      // Already done
      return;
    }

    // Expand and click analyze
    await expandProject(page, novelProjectTitle);

    const analyzeBtn = page.getByRole("button", { name: /分析原著|分析/ }).first();
    if (await analyzeBtn.isEnabled()) {
      await analyzeBtn.click();
      await page.waitForTimeout(2_000);
      await assertNoErrorToast(page);
    }

    await waitForProjectStatus(page, novelProjectTitle, "已分析", {
      timeout: 180_000,
    });
  });

  test("4. 分集规划", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    const planBtn = page.getByRole("button", { name: /分集规划|规划/ }).first();
    await planBtn.click();
    await page.waitForTimeout(2_000);
    await assertNoErrorToast(page);

    await waitForProjectStatus(page, novelProjectTitle, "已规划", {
      timeout: 120_000,
    });

    // Verify episodes visible
    await expandProject(page, novelProjectTitle);
    await expect(page.getByText(/EP\d/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("5. 设计策略", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    const strategyBtn = page.getByRole("button", { name: /设计策略|策略/ }).first();
    await strategyBtn.click();
    await page.waitForTimeout(2_000);
    await assertNoErrorToast(page);

    await waitForProjectStatus(page, novelProjectTitle, "策略待确认", {
      timeout: 180_000,
    });

    // Verify strategy panel visible after expanding
    await expandProject(page, novelProjectTitle);
    await expect(
      page.getByText("改写策略").or(page.getByText("策略概述")).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("6. 确认策略并执行", async ({ page }) => {
    // Full pipeline (write + reflect + improve + review) for 2-3 episodes is very slow
    test.setTimeout(1_200_000); // 20 minutes

    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    const confirmBtn = page.getByRole("button", { name: "确认并执行" });
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await page.waitForTimeout(2_000);
    await assertNoErrorToast(page);

    // Wait for full pipeline completion — 18 min timeout, poll every 30s
    await waitForProjectStatus(page, novelProjectTitle, "已完成", {
      timeout: 1_100_000,
      pollInterval: 30_000,
    });
  });

  test("7. 查看内容", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    // Click first episode expand
    const ep1 = page.getByText(/EP1/).first();
    await ep1.click();
    await page.waitForTimeout(1_000);

    const viewScriptBtn = page
      .getByText("查看脚本")
      .or(page.getByText("查看剧本"))
      .first();
    await viewScriptBtn.click();
    await page.waitForTimeout(1_000);

    // Verify content visible
    await expect(
      page.locator("pre, .whitespace-pre-wrap").first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });

  test("8. 阅读全文", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    const readFullBtn = page.getByRole("button", { name: "阅读全文" });
    await expect(readFullBtn).toBeVisible({ timeout: 10_000 });
    await readFullBtn.click();

    await page.waitForURL(/\/agents\/.*\/reader/, { timeout: 15_000 });
    expect(page.url()).toContain("/reader");

    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);
  });

  test("9. 导入到项目", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await expandProject(page, novelProjectTitle);

    const publishBtn = page.getByRole("button", { name: "导入到项目" });
    await expect(publishBtn).toBeVisible({ timeout: 10_000 });
    await publishBtn.click();
    await page.waitForTimeout(1_000);

    // Confirm in modal
    const confirmPublish = page.getByRole("button", { name: "确认" }).or(
      page.locator('button[type="submit"]').filter({ hasText: /确认|导入/ }),
    );
    await expect(confirmPublish.first()).toBeVisible({ timeout: 5_000 });
    await confirmPublish.first().click();

    await page.waitForURL(/\/projects\//, { timeout: 15_000 });
    expect(page.url()).toContain("/projects/");
  });

  test("10. 创建剧本模式项目（全自动）", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    await page.getByRole("button", { name: "新建改编项目" }).click();
    await page.waitForTimeout(1_000);

    await page.locator("input#title").fill(autoProjectTitle);

    const textarea = page.locator("textarea").first();
    await textarea.fill(TEST_NOVEL.split("第三章")[0]);

    // Select "剧本" format — scope to form
    const form = page.locator("form").first();
    await form.getByRole("button", { name: "剧本", exact: true }).click();
    await page.waitForTimeout(500);

    // Enable auto mode
    const autoCheckbox = page.locator('input[type="checkbox"]').first();
    if (!(await autoCheckbox.isChecked())) {
      await autoCheckbox.check();
    }

    await page.locator('button[type="submit"]').filter({ hasText: "创建" }).click();
    await page.waitForTimeout(3_000);
    await assertNoErrorToast(page);

    await expect(page.getByText(autoProjectTitle).first()).toBeVisible({
      timeout: 10_000,
    });

    await waitForProjectStatus(page, autoProjectTitle, "已完成", {
      timeout: 600_000,
      pollInterval: 15_000,
    });
  });

  test("11. 删除项目", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/agents`);
    await page.waitForTimeout(2_000);

    // Delete novel project — find the card's delete button
    // The card structure: <div(card)> contains <div> with toggle button + action buttons
    // Delete button is a small button with trash icon at the end of the header row
    const novelToggle = page.locator("button").filter({ hasText: novelProjectTitle }).first();
    // The delete button is a sibling in the same row container
    const novelRow = novelToggle.locator(".."); // parent div
    const deleteBtn = novelRow.locator('button:has(svg)').last();
    await deleteBtn.click();
    await page.waitForTimeout(500);

    // Confirm
    const confirmBtn = page.getByRole("button", { name: "确认" }).or(
      page.getByRole("button", { name: "确定" }),
    );
    if (await confirmBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.first().click();
    }
    await page.waitForTimeout(2_000);

    // Verify removed
    await page.reload();
    await page.waitForTimeout(2_000);
    await expect(page.getByText(novelProjectTitle)).toHaveCount(0, { timeout: 10_000 });

    // Delete auto project too
    const autoToggle = page.locator("button").filter({ hasText: autoProjectTitle }).first();
    if (await autoToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const autoRow = autoToggle.locator("..");
      const autoDelete = autoRow.locator('button:has(svg)').last();
      await autoDelete.click();
      await page.waitForTimeout(500);
      if (await confirmBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.first().click();
      }
      await page.waitForTimeout(2_000);
    }
  });
});
