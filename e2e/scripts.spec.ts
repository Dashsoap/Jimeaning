import { test, expect, type Page } from "@playwright/test";
import {
  login,
  waitForTaskComplete,
  waitForToast,
  fillTextarea,
  waitForApiResponse,
  assertNoErrorToast,
} from "./helpers";

const LOCALE = process.env.E2E_LOCALE || "zh";

// Short test script for create/edit
const TEST_SCRIPT_CONTENT =
  "清晨的阳光透过窗帘，林晓缓缓睁开眼。手机上显示着三条未读消息，全是来自陈默的。她叹了口气，起身洗漱。出门时，她在楼下碰到邻居王阿姨，打了声招呼便匆匆赶往地铁站。路上人潮拥挤，她被挤到车门边，手机差点掉了。到了公司，同事小张递过来一杯咖啡，笑着说今天有好事要发生。";

// Short novel with chapter markers for smart-import
const TEST_NOVEL = `第一章 初遇

林晓从咖啡店出来，迎面撞上了一个穿白衬衫的男人。咖啡洒了一地。
"对不起！"她慌忙道歉。
男人蹲下来帮她捡东西，抬头一笑："没关系，我叫陈默。"
那天的阳光很好，林晓不知道，这个偶遇会改变她的一生。
她回到公司，心里还在想着那个温暖的笑容。同事小张问她怎么了，她摇摇头说没事。

第二章 重逢

一个月后，林晓在新公司报到。推开办公室的门，她愣住了——坐在主管位置上的人，正是陈默。
"林小姐，我们又见面了。"陈默放下文件，嘴角微扬。
林晓心里一紧，她不喜欢这种被命运捉弄的感觉。
接下来的日子里，两人保持着客气而疏远的距离。直到一次团建活动，陈默主动坐到她身边。

第三章 转折

项目截止日前三天，系统突然崩溃。整个团队加班到凌晨三点。
林晓累得趴在桌上，醒来时发现身上多了一件外套。陈默坐在对面，盯着屏幕敲代码。
"你不用管我。"她小声说。
"管你是主管的职责。"他头也不抬。
林晓望着他的侧脸，忽然觉得，也许被命运捉弄并不全是坏事。`;

const TIMESTAMP = Date.now();
const TEST_TITLE = `E2E剧本_${TIMESTAMP}`;
const TEST_TITLE_EDITED = `E2E剧本_已编辑_${TIMESTAMP}`;

/**
 * Find a script card by its title h3, then navigate up to the card root.
 * The card structure is: div(card) > div(header) > div(title-row) > h3
 * We go up from h3 to the nearest ancestor that looks like a card container.
 */
function findScriptCard(page: Page, title: string) {
  // Find the h3 with the exact title, then go up to card level
  // The card is the nearest ancestor with a border/rounded class
  return page.locator("h3").filter({ hasText: title }).first()
    .locator("xpath=ancestor::div[contains(@class, 'rounded')]").first();
}

/**
 * Open the "更多操作" dropdown menu on a script card.
 */
async function openScriptMenu(page: Page, title: string) {
  const card = findScriptCard(page, title);
  // The menu trigger button has title="更多操作" or contains the MoreHorizontal icon
  const menuTrigger = card.getByTitle("更多操作").or(
    card.locator('button:has(svg)').last(),
  ).first();
  await menuTrigger.click();
  await page.waitForTimeout(500);
}

test.describe.serial("剧本库完整流程", () => {
  let createdScriptTitle = TEST_TITLE;

  test("1. 登录并访问剧本库", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await expect(page.locator("h1").filter({ hasText: "剧本库" })).toBeVisible();
  });

  test("2. 手动创建剧本", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    // Click "新建剧本"
    await page.getByRole("button", { name: "新建剧本" }).click();
    await page.waitForTimeout(500);

    // Fill title
    await page.locator("input#title").fill(TEST_TITLE);

    // Fill content
    const contentField = page.locator("textarea#content").or(page.locator("textarea").first());
    await contentField.fill(TEST_SCRIPT_CONTENT);

    // Submit
    await page.locator('button[type="submit"]').filter({ hasText: "创建" }).click();
    await page.waitForTimeout(2_000);

    // Verify script appears in list
    const heading = page.locator("h3").filter({ hasText: TEST_TITLE }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Verify "手动" badge — sibling span in the same title row container
    const titleRow = heading.locator("..");
    await expect(
      titleRow.locator("span").filter({ hasText: "手动" }).first(),
    ).toBeVisible();
  });

  test("3. 查看剧本", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await openScriptMenu(page, TEST_TITLE);

    // Click "查看"
    await page.getByText("查看", { exact: true }).click();
    await page.waitForTimeout(1_000);

    // Verify content visible in modal — use the modal's whitespace-pre-wrap container
    const modalContent = page.locator(".whitespace-pre-wrap").first();
    await expect(modalContent).toBeVisible({ timeout: 5_000 });

    // Close modal
    const closeBtn = page.getByRole("button", { name: "关闭" });
    if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(500);
  });

  test("4. 编辑剧本", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await openScriptMenu(page, TEST_TITLE);

    await page.getByText("编辑", { exact: true }).click();
    await page.waitForTimeout(1_000);

    // Modify title
    const titleInput = page.locator("input#edit-title").or(page.locator("input#title"));
    await titleInput.clear();
    await titleInput.fill(TEST_TITLE_EDITED);

    // Save
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(2_000);

    // Verify updated title
    await expect(
      page.locator("h3").filter({ hasText: TEST_TITLE_EDITED }).first(),
    ).toBeVisible({ timeout: 10_000 });
    createdScriptTitle = TEST_TITLE_EDITED;
  });

  test("5. 筛选和搜索", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    // Click "手动" filter tab
    await page.getByRole("button", { name: "手动", exact: true }).click();
    await page.waitForTimeout(1_000);

    // Verify our test script is still visible
    await expect(page.getByText(createdScriptTitle).first()).toBeVisible({
      timeout: 5_000,
    });

    // Click "全部" to reset filter
    await page.getByRole("button", { name: "全部", exact: true }).click();
    await page.waitForTimeout(1_000);

    // Search by title
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill(createdScriptTitle.slice(0, 10));
    await page.waitForTimeout(1_000);

    // Verify search results
    await expect(page.getByText(createdScriptTitle).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("6. 改写剧本", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    // Click "内容洗稿"
    await page.getByRole("button", { name: "内容洗稿" }).click();
    await page.waitForTimeout(1_000);

    // Select script from dropdown
    const select = page.locator("select").first();
    if (await select.isVisible({ timeout: 3_000 })) {
      const options = await select.locator("option").allTextContents();
      const match = options.find((o) => o.includes(createdScriptTitle));
      if (match) {
        await select.selectOption({ label: match });
      }
    }

    // Enter rewrite prompt
    const rewriteTextarea = page.locator("textarea").first();
    await rewriteTextarea.fill("将对话改为更幽默轻松的风格，增加生活气息");

    // Start rewrite
    const startBtn = page.getByRole("button", { name: "开始改写" });
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });
    await startBtn.click();

    await page.waitForTimeout(3_000);
    await assertNoErrorToast(page);

    // Wait for "保存剧本" button
    await expect(
      page.getByRole("button", { name: "保存剧本" }),
    ).toBeVisible({ timeout: 300_000 });

    await page.getByRole("button", { name: "保存剧本" }).click();
    await page.waitForTimeout(2_000);

    // Verify "改写" type script appears
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await page.getByRole("button", { name: "改写", exact: true }).click();
    await page.waitForTimeout(1_000);

    // Should see at least one script with "改写" badge
    const rewriteHeading = page.locator("h3").first();
    await expect(rewriteHeading).toBeVisible({ timeout: 10_000 });
  });

  test("7. 从剧本创建项目", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    // Find our card and click "创建项目"
    const card = findScriptCard(page, createdScriptTitle);
    const createProjectBtn = card.getByRole("button", { name: "创建项目" });
    await createProjectBtn.click();

    await page.waitForURL(/\/projects\//, { timeout: 15_000 });
    expect(page.url()).toContain("/projects/");
  });

  test("8. 智能导入（分章）", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    // Click "智能导入"
    await page.getByRole("button", { name: "智能导入" }).click();
    await page.waitForTimeout(1_000);

    // Step 1: Paste novel text
    const textarea = page.locator("textarea").first();
    await textarea.fill(TEST_NOVEL);
    await page.waitForTimeout(500);

    // Click "下一步"
    await page.getByRole("button", { name: "下一步" }).click();
    await page.waitForTimeout(1_000);

    // Step 2: Set parameters — click next or start
    const nextOrStart = page.getByRole("button", { name: "下一步" }).or(
      page.getByRole("button", { name: "开始分章" }),
    );
    await nextOrStart.first().click();
    await page.waitForTimeout(1_000);

    // Start analysis if button visible
    const startAnalysis = page.getByRole("button", { name: "开始分章" });
    if (await startAnalysis.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await startAnalysis.click();
    }

    // Wait for chapters (regex detection should be instant for 第X章 markers)
    await page.waitForTimeout(5_000);
    const chapterIndicator = page.getByText(/共 \d+ 章/).or(page.getByText(/3 章/));
    await expect(chapterIndicator.first()).toBeVisible({ timeout: 180_000 });

    // Confirm chapters
    const confirmBtn = page.getByRole("button", { name: "确认分章" });
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2_000);
    }

    // Skip rewrite
    const skipBtn = page.getByRole("button", { name: "跳过改写" }).or(
      page.getByRole("button", { name: "完成" }),
    );
    if (await skipBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipBtn.first().click();
      await page.waitForTimeout(2_000);
    }

    // Verify import-type script in list
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await page.getByRole("button", { name: "导入", exact: true }).click();
    await page.waitForTimeout(1_000);

    // Should see at least one import badge
    const importBadge = page.locator("span").filter({ hasText: "导入" });
    await expect(importBadge.first()).toBeVisible({ timeout: 10_000 });
  });

  test("9. 删除剧本", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);

    await openScriptMenu(page, createdScriptTitle);

    // Click "删除"
    await page.getByText("删除", { exact: true }).click();
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
    await page.goto(`/${LOCALE}/scripts`);
    await page.waitForTimeout(2_000);
    await expect(page.getByText(createdScriptTitle)).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
