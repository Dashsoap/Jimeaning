#!/usr/bin/env npx tsx
/**
 * E2E Test: 黑白 第一章 → LiblibAI 图片 + Kling 视频
 *
 * 流程:
 * 1. 从小说中提取第一章文本
 * 2. 用 LLM 生成 3 个分镜场景描述
 * 3. 用 LiblibAI Seedream 4 生成图片
 * 4. 用 LiblibAI Kling img2video 生成视频
 * 5. 输出所有 URL
 *
 * Usage: npx tsx scripts/e2e-liblib-heibai.ts
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ─── Config ──────────────────────────────────────────────────────────────

const LIBLIB_ACCESS_KEY = "tYvcibzSY1Tc6u2n3Pb2dA";
const LIBLIB_SECRET_KEY = "KiXK6oADsgHwR-k0ZF_HOL8m_5czoOzz";
const BASE_URL = "https://openapi.liblibai.cloud";

// Image: Seedream 4.0
const IMAGE_ENDPOINT = "/api/generate/seedreamV4";
const IMAGE_TEMPLATE_UUID = "0b6bad2fd350433ebb5abc7eb91f2ec9";

// Video: Kling img2video
const VIDEO_ENDPOINT = "/api/generate/video/kling/img2video";
const VIDEO_TEMPLATE_UUID = "180f33c6748041b48593030156d2a71d";

const STATUS_ENDPOINT = "/api/generate/status";

// ─── Auth ────────────────────────────────────────────────────────────────

function generateSignature(uri: string, timestamp: number, nonce: string): string {
  const signStr = `${uri}&${timestamp}&${nonce}`;
  const hmac = crypto.createHmac("sha1", LIBLIB_SECRET_KEY).update(signStr).digest("base64");
  return hmac.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildUrl(uri: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const signature = generateSignature(uri, timestamp, nonce);
  const qs = new URLSearchParams({
    AccessKey: LIBLIB_ACCESS_KEY,
    Signature: signature,
    Timestamp: String(timestamp),
    SignatureNonce: nonce,
  }).toString();
  return `${BASE_URL}${uri}?${qs}`;
}

async function apiCall(uri: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = buildUrl(uri);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Polling ─────────────────────────────────────────────────────────────

async function pollImage(generateUuid: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const data = await apiCall(STATUS_ENDPOINT, { generateUuid });
    const inner = data.data as Record<string, unknown> | undefined;
    const status = inner?.generateStatus;
    const pct = inner?.percentCompleted;
    process.stdout.write(`\r  📸 Image poll #${i + 1}: status=${status} pct=${pct}  `);

    if (status === 5) {
      const images = inner?.images as Array<Record<string, string>> | undefined;
      const url = images?.[0]?.imageUrl;
      console.log(`\n  ✅ Image ready: ${url}`);
      return url!;
    }
    if (status === 6 || status === 7) {
      throw new Error(`Image generation failed: ${JSON.stringify(inner)}`);
    }
  }
  throw new Error("Image polling timed out");
}

async function pollVideo(generateUuid: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const data = await apiCall(STATUS_ENDPOINT, { generateUuid });
    const inner = data.data as Record<string, unknown> | undefined;
    const status = inner?.generateStatus;
    const pct = inner?.percentCompleted;
    process.stdout.write(`\r  🎬 Video poll #${i + 1}: status=${status} pct=${pct}  `);

    if (status === 5) {
      const videos = inner?.videos as Array<Record<string, string>> | undefined;
      const url = videos?.[0]?.videoUrl;
      console.log(`\n  ✅ Video ready: ${url}`);
      return url!;
    }
    if (status === 6 || status === 7) {
      throw new Error(`Video generation failed: ${JSON.stringify(inner)}`);
    }
  }
  throw new Error("Video polling timed out");
}

// ─── Scenes ──────────────────────────────────────────────────────────────

// 预定义 3 个黑白第一章的关键场景（省去 LLM 调用，直接用人工提取的场景描述）
const SCENES = [
  {
    id: 1,
    title: "阳台夜色 — 唐易怒斥管家",
    imagePrompt:
      "A young East Asian man with striking handsome features, messy black hair, wearing an unbuttoned white dress shirt revealing collarbones, standing on a luxury villa balcony at night, leaning against marble railing, smoking a thin cigarette, smoke rising in moonlight, cold expression, moody lighting, dark shadows, blue-grey tones, film noir, 3D animation, cinematic lighting, highly detailed, 8K resolution, depth of field",
    videoPrompt:
      "男人缓缓吐出一口烟雾，烟雾在月色中升腾。他转身面向镜头，眼神冰冷锐利，嘴角微微上扬，露出危险的笑容。背景是夜色中的别墅阳台和花园。慢镜头，电影级光影。",
  },
  {
    id: 2,
    title: "主卧室 — 邵其轩为少夫人治疗",
    imagePrompt:
      "A young East Asian woman with a gentle beautiful face, long black hair spread on white pillow, lying in a luxurious bed in a dimly lit master bedroom, receiving IV drip from a young male doctor in white coat, warm ambient light from bedside lamp, soft shadows, elegant interior, oil painting style, 3D animation, cinematic lighting, highly detailed, 8K resolution, medium shot",
    videoPrompt:
      "年轻女子微微睁开眼睛，虚弱地看向医生，嘴角浮现一丝淡淡的笑意。医生安抚地轻触她的额头。柔和的灯光洒在她苍白的脸上。温暖柔和的镜头运动。",
  },
  {
    id: 3,
    title: "月下花园 — 唐易凝视玫瑰",
    imagePrompt:
      "A young East Asian man in white dress shirt, standing alone on balcony looking down at a magnificent rose garden below, moonlit night scene, roses in red yellow purple white colors blooming everywhere, his reflection visible in glass railing, contemplative expression, backlit by moonlight, purple twilight, bokeh, 3D animation, cinematic lighting, highly detailed, 8K resolution, wide shot, melancholic atmosphere",
    videoPrompt:
      "男人低头凝视花园中绽放的玫瑰丛，月光洒落，花朵随微风轻轻摇曳。他熄灭手中的烟，缓缓转身走向卧室方向。镜头从花园缓缓上升至月亮。电影感运镜。",
  },
];

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🎬 黑白 · 第一章「折翼」— LiblibAI E2E 生成测试");
  console.log("═══════════════════════════════════════════════════════════\n");

  const results: Array<{
    scene: string;
    imageUrl: string;
    videoUrl: string;
  }> = [];

  for (const scene of SCENES) {
    console.log(`\n━━━ Scene ${scene.id}: ${scene.title} ━━━`);

    // Step 1: Generate Image
    console.log("  [1/2] 生成图片 (Seedream 4.0)...");
    const imgResult = await apiCall(IMAGE_ENDPOINT, {
      templateUuid: IMAGE_TEMPLATE_UUID,
      generateParams: {
        prompt: scene.imagePrompt,
        width: 1280,
        height: 720,
        imgCount: 1,
      },
    });

    if ((imgResult.code as number) !== 0) {
      console.error(`  ❌ Image submit failed: ${imgResult.msg}`);
      continue;
    }

    const imgUuid = (imgResult.data as Record<string, string>)?.generateUuid;
    console.log(`  Task submitted: ${imgUuid}`);
    const imageUrl = await pollImage(imgUuid);

    // Rate limit: wait before video submission
    await sleep(2000);

    // Step 2: Generate Video
    console.log("  [2/2] 生成视频 (Kling img2video)...");
    const vidResult = await apiCall(VIDEO_ENDPOINT, {
      templateUuid: VIDEO_TEMPLATE_UUID,
      generateParams: {
        model: "kling-v2-1",
        prompt: scene.videoPrompt,
        promptMagic: 0,
        startFrame: imageUrl,
        duration: "5",
        mode: "std",
      },
    });

    if ((vidResult.code as number) !== 0) {
      console.error(`  ❌ Video submit failed: ${vidResult.msg}`);
      results.push({ scene: scene.title, imageUrl, videoUrl: "FAILED" });
      continue;
    }

    const vidUuid = (vidResult.data as Record<string, string>)?.generateUuid;
    console.log(`  Task submitted: ${vidUuid}`);
    const videoUrl = await pollVideo(vidUuid);

    results.push({ scene: scene.title, imageUrl, videoUrl });

    // Rate limit between scenes
    await sleep(2000);
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  📋 生成结果汇总");
  console.log("═══════════════════════════════════════════════════════════\n");

  for (const r of results) {
    console.log(`  🎬 ${r.scene}`);
    console.log(`     📸 图片: ${r.imageUrl}`);
    console.log(`     🎥 视频: ${r.videoUrl}`);
    console.log();
  }

  // Save results to JSON
  const outPath = path.join(process.cwd(), "data", "e2e-heibai-results.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`  💾 结果已保存: ${outPath}`);
}

main().catch((err) => {
  console.error("\n❌ E2E test failed:", err);
  process.exit(1);
});
