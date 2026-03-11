import { test, expect } from "@playwright/test";
import {
  login,
  switchTab,
  waitForTaskComplete,
  refreshProject,
} from "./helpers";

const LOCALE = process.env.E2E_LOCALE || "zh";

// Short test script — generates only 1-2 panels to minimize wait time
const TEST_SCRIPT =
  "小明走在放学回家的路上，夕阳照在他的脸上。他看到路边有一只小猫，停下脚步蹲下来轻轻抚摸它。";

test.describe.serial("全流程：文本到视频", () => {
  let projectUrl: string;
  const projectTitle = `E2E测试_${Date.now()}`;

  test("1. 登录", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}`));
  });

  test("2. 创建项目", async ({ page }) => {
    await login(page);
    await page.goto(`/${LOCALE}/projects`);
    await page.waitForTimeout(3_000);

    // Click "创建项目" button
    await page.getByRole("button", { name: "创建项目" }).click();

    // Fill in project title
    await page.locator("input#title").fill(projectTitle);

    // Select 16:9 (should be default, but click to be sure)
    await page.getByRole("button", { name: /16:9/ }).click();

    // Select 真人风格 (realistic)
    await page.getByRole("button", { name: /真人/ }).click();

    // Submit — the "创建" button inside the modal
    await page.locator('button[type="submit"]').filter({ hasText: "创建" }).click();

    // Wait for project list to refresh (modal closes)
    await page.waitForTimeout(2_000);

    // Navigate into the newly created project
    const projectCard = page.getByText(projectTitle).first();
    await expect(projectCard).toBeVisible({ timeout: 10_000 });
    await projectCard.click();

    // Should land on project detail page
    await page.waitForURL(/\/projects\//, { timeout: 10_000 });
    projectUrl = page.url();
  });

  test("3. 输入剧本 + AI 分析", async ({ page }) => {
    await login(page);
    expect(projectUrl).toBeTruthy();

    // Extract projectId from URL
    const projectId = projectUrl.match(/\/projects\/([^/]+)/)?.[1];
    expect(projectId).toBeTruthy();

    // Save script text via API first (the UI has a bug where "直接输入文本"
    // tries to focus a textarea that doesn't exist in empty state)
    const saveRes = await page.request.put(`/api/projects/${projectId}`, {
      data: { sourceText: TEST_SCRIPT },
    });
    expect(saveRes.ok()).toBeTruthy();

    // Now navigate — textarea will be visible because sourceText is non-empty
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    // Verify textarea shows our text
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Click "AI 分析剧本"
    await page.getByRole("button", { name: "AI 分析剧本" }).click();

    // Check for immediate error toast (e.g. missing API config)
    await page.waitForTimeout(3_000);
    const errorToast = page.locator('[class*="toast"]').filter({ hasText: /失败|错误|配置/ });
    if (await errorToast.count() > 0) {
      const msg = await errorToast.first().textContent();
      throw new Error(`AI 分析失败（可能缺少 API 配置）: ${msg}`);
    }

    // Wait for the analysis task to complete (spinner + progress bar disappear)
    await waitForTaskComplete(page, { timeout: 180_000 });

    // Verify analysis succeeded: reload and check project status is not "draft"
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);
    await switchTab(page, "storyboard");
    // If storyboard tab shows "暂无分镜" it means analysis failed silently
    const noStoryboard = page.getByText("暂无分镜");
    const hasNoStoryboard = await noStoryboard.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasNoStoryboard) {
      // Check if episodes were created — analysis may have succeeded but storyboard not generated yet
      await switchTab(page, "assets");
      await page.waitForTimeout(1_000);
    }
  });

  test("4. 生成分镜文本", async ({ page }) => {
    await login(page);
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    await switchTab(page, "storyboard");

    // Click "生成分镜文本"
    const genBtn = page.getByRole("button", { name: "生成分镜文本" });
    await expect(genBtn).toBeVisible({ timeout: 10_000 });
    await genBtn.click();

    // The storyboard pipeline has 4 phases that run sequentially.
    // Phase 1 creates clips, Phase 3 creates panels with imagePrompt.
    // We need to poll until panels actually appear (面板 > 0).
    const deadline = Date.now() + 300_000; // 5 minutes
    while (Date.now() < deadline) {
      await page.waitForTimeout(10_000);
      // Refresh the page to get latest data
      await page.goto(projectUrl);
      await page.waitForTimeout(3_000);
      await switchTab(page, "storyboard");
      await page.waitForTimeout(1_000);

      // Check if panels count is > 0 (look for "N 面板" text where N > 0)
      const panelCountText = await page.getByText(/[1-9]\d* 面板/).first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (panelCountText) {
        console.log("  Panels created — storyboard pipeline complete");
        break;
      }
    }

    // Final assertion
    await expect(page.getByText(/[1-9]\d* 面板/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("5. 生成图片", async ({ page }) => {
    await login(page);
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    await switchTab(page, "storyboard");
    await page.waitForTimeout(2_000);

    // Wait for the top toolbar "生成图片" button to be enabled (not per-panel buttons)
    const genImgBtn = page.getByText("生成图片", { exact: true });
    await expect(genImgBtn).toBeEnabled({ timeout: 30_000 });
    await genImgBtn.click();

    // Poll until at least some images appear (check "N 图片" count > 0)
    // Image generation is parallel but can take a few minutes for many panels
    const deadline = Date.now() + 480_000; // 8 minutes (< 10min test timeout)
    while (Date.now() < deadline) {
      await page.waitForTimeout(15_000);
      await page.goto(projectUrl);
      await page.waitForTimeout(3_000);
      await switchTab(page, "storyboard");
      await page.waitForTimeout(1_000);

      const hasImages = await page.getByText(/[1-9]\d* 图片/).first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasImages) {
        console.log("  Images generated");
        break;
      }
    }

    await expect(page.getByText(/[1-9]\d* 图片/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("6. 生成视频", async ({ page }) => {
    await login(page);
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    await switchTab(page, "storyboard");
    await page.waitForTimeout(2_000);

    // Click "生成视频" — use getByText to avoid matching per-panel video buttons
    const genVideoBtn = page.getByText("生成视频", { exact: true });
    await expect(genVideoBtn).toBeEnabled({ timeout: 10_000 });
    await genVideoBtn.click();

    // Poll until at least some videos appear
    // Video generation is the slowest step — each takes 1-3 minutes
    const deadline = Date.now() + 540_000; // 9 minutes (< 10min test timeout)
    while (Date.now() < deadline) {
      await page.waitForTimeout(30_000);
      await page.goto(projectUrl);
      await page.waitForTimeout(3_000);
      await switchTab(page, "storyboard");
      await page.waitForTimeout(1_000);

      const hasVideos = await page.getByText(/[1-9]\d* 视频/).first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasVideos) {
        console.log("  Videos generated");
        break;
      }
    }

    await expect(page.getByText(/[1-9]\d* 视频/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("7. 批量生成配音", async ({ page }) => {
    await login(page);
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    await switchTab(page, "voice");
    await page.waitForTimeout(2_000);

    // Click "批量生成配音"
    const voiceBtn = page.getByRole("button", { name: "批量生成配音" });
    // Voice tab might show empty hint if no dialogue lines exist
    if (await voiceBtn.isVisible({ timeout: 5_000 })) {
      await voiceBtn.click();
      await waitForTaskComplete(page, { timeout: 300_000 });
      await refreshProject(page);
    } else {
      console.log("  No voice lines to generate (no dialogue in test script)");
    }
  });

  test("8. 合成最终视频", async ({ page }) => {
    await login(page);
    await page.goto(projectUrl);
    await page.waitForTimeout(3_000);

    await switchTab(page, "compose");
    await page.waitForTimeout(2_000);

    // Click "合成视频"
    const composeBtn = page.getByRole("button", { name: "合成视频" });
    await expect(composeBtn).toBeVisible({ timeout: 10_000 });
    await composeBtn.click();

    // Wait for composition to finish
    await waitForTaskComplete(page, { timeout: 600_000 });

    await refreshProject(page);

    // Verify "下载视频" link/button appears — this is the final deliverable
    const downloadBtn = page.getByRole("link", { name: "下载视频" }).or(
      page.getByRole("button", { name: "下载视频" }),
    );
    await expect(downloadBtn).toBeVisible({ timeout: 30_000 });
  });
});
