import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getProviderConfig, resolveDefaultModel } from "@/lib/api-config";
import { REVERSE_SCRIPT_PROMPT, ANALYZE_SCRIPT_PROMPT } from "@/lib/llm/prompts/reverse-script";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

// Files smaller than this use inline base64 (no Files API upload needed)
const INLINE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB

export const handleReverseScript = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const mediaPath = data.mediaPath as string;
  const mediaType = data.mediaType as string; // video | audio | image
  const customPrompt = data.customPrompt as string | undefined;

  // 1. Get Google provider config (fallback to openai-compatible proxy)
  let googleConfig;
  try {
    googleConfig = await getProviderConfig(userId, "google");
  } catch {
    // google provider not configured, try openai-compatible as proxy
    googleConfig = await getProviderConfig(userId, "openai-compatible");
  }
  if (!googleConfig.apiKey) {
    throw new Error("Google API key not configured. Please add a Google or OpenAI Compatible provider in settings.");
  }

  await ctx.reportProgress(10);

  // 2. Initialize Gemini client
  // Google SDK appends its own paths (e.g. /v1beta/files), so strip trailing /v1 from proxy URLs
  const baseUrl = googleConfig.baseUrl?.replace(/\/v1\/?$/, "") || undefined;
  const genai = new GoogleGenAI({
    apiKey: googleConfig.apiKey,
    httpOptions: {
      ...(baseUrl ? { baseUrl } : {}),
      timeout: 5 * 60 * 1000, // 5 minutes for large media processing
    },
  });

  // 3. Read media file
  const absolutePath = path.resolve(mediaPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Media file not found: ${absolutePath}`);
  }

  const fileSize = fs.statSync(absolutePath).size;
  const mimeType = getMimeType(absolutePath, mediaType);

  await ctx.reportProgress(20);

  // 4. Build media part - inline base64 for small files, Files API for large files
  let mediaPart: { inlineData: { data: string; mimeType: string } } | { fileData: { fileUri: string; mimeType: string } };

  if (fileSize <= INLINE_SIZE_LIMIT) {
    // Small file: send inline as base64
    const fileBuffer = fs.readFileSync(absolutePath);
    const base64Data = fileBuffer.toString("base64");
    mediaPart = {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    };
    await ctx.reportProgress(50);
  } else {
    // Large file: use Files API upload (requires direct Google access or proxy that supports it)
    const uploadResult = await genai.files.upload({
      file: absolutePath,
      config: { mimeType },
    });

    await ctx.reportProgress(40);

    // Wait for file processing (for video/audio)
    let file = uploadResult;
    if (mediaType !== "image" && file.state === "PROCESSING") {
      while (file.state === "PROCESSING") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const fileStatus = await genai.files.get({ name: file.name! });
        file = fileStatus;
      }
    }

    if (file.state === "FAILED") {
      throw new Error("Gemini file processing failed");
    }

    mediaPart = {
      fileData: {
        fileUri: file.uri!,
        mimeType: file.mimeType!,
      },
    };
    await ctx.reportProgress(50);
  }

  await ctx.reportProgress(60);

  // 5. Resolve model - use user's default LLM or fallback to gemini-2.0-flash
  let modelId = "gemini-2.0-flash";
  try {
    const defaultModel = await resolveDefaultModel(userId, "llm");
    modelId = defaultModel.modelId;
  } catch {
    // no default LLM configured, use fallback
  }

  // 6. Generate script from media (streaming)
  const prompt = customPrompt
    ? `${REVERSE_SCRIPT_PROMPT}\n\n用户额外要求：${customPrompt}`
    : REVERSE_SCRIPT_PROMPT;

  let resultText = "";
  const stream = await genai.models.generateContentStream({
    model: modelId,
    contents: [
      {
        role: "user",
        parts: [
          mediaPart,
          { text: prompt },
        ],
      },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.text ?? "";
    if (text) {
      resultText += text;
      ctx.publishText(text);
    }
  }
  await ctx.flushText();

  if (!resultText.trim()) {
    throw new Error("Gemini returned empty response");
  }

  await ctx.reportProgress(80);

  // 6. Extract title (first line) and content
  const lines = resultText.trim().split("\n");
  const title = lines[0].replace(/^[#\s*]+/, "").trim() || "倒推剧本";
  const content = lines.slice(1).join("\n").trim() || resultText.trim();

  // 7. Phase 2: Structured analysis via non-streaming Gemini call
  await ctx.reportProgress(85);
  ctx.publishText("\n\n--- 正在进行结构化分析 ---\n");
  let analysisData: Prisma.InputJsonValue | null = null;

  const parseJsonFromText = (text: string): Prisma.InputJsonValue | null => {
    if (!text.trim()) return null;

    // Try direct parse
    try {
      return JSON.parse(text);
    } catch { /* not pure JSON */ }

    // Extract from markdown code block: ```json\n{...}\n```
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch { /* code block content isn't valid JSON */ }
    }

    // Greedy extract: first { to last }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch { /* extracted block isn't valid JSON */ }
    }

    return null;
  };

  const callAnalysis = async (useJsonMime: boolean): Promise<string> => {
    const analysisResult = await genai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: "user",
          parts: [{ text: `${ANALYZE_SCRIPT_PROMPT}\n\n---\n\n${resultText}` }],
        },
      ],
      ...(useJsonMime ? { config: { responseMimeType: "application/json" } } : {}),
    });
    return analysisResult.text ?? "";
  };

  // Attempt 1: without responseMimeType (most compatible with proxies)
  try {
    const text = await callAnalysis(false);
    analysisData = parseJsonFromText(text);
    if (!analysisData) {
      console.warn("[reverse-script] Attempt 1: got text but JSON parse failed. Response:", text.substring(0, 500));
    }
  } catch (err) {
    console.warn("[reverse-script] Attempt 1 failed:", err instanceof Error ? err.message : err);
  }

  // Attempt 2: with responseMimeType (works on direct Google API)
  if (!analysisData) {
    try {
      const text = await callAnalysis(true);
      analysisData = parseJsonFromText(text);
      if (!analysisData) {
        console.warn("[reverse-script] Attempt 2: got text but JSON parse failed. Response:", text.substring(0, 500));
      }
    } catch (err) {
      console.warn("[reverse-script] Attempt 2 failed:", err instanceof Error ? err.message : err);
    }
  }

  if (analysisData) {
    ctx.publishText("结构化分析完成 ✓\n");
  } else {
    ctx.publishText("结构化分析失败（将仅保存剧本文本）\n");
  }

  await ctx.reportProgress(95);

  // 8. Save to Script table
  const script = await prisma.script.create({
    data: {
      userId,
      title,
      content,
      sourceType: "reverse",
      sourceMedia: mediaPath,
      prompt: customPrompt,
      ...(analysisData ? { analysisData } : {}),
    },
  });

  return { scriptId: script.id, title: script.title };
});

function getMimeType(filePath: string, type: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Video
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    // Image
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };

  if (mimeTypes[ext]) return mimeTypes[ext];

  // Fallback by type
  const fallbacks: Record<string, string> = {
    video: "video/mp4",
    audio: "audio/mpeg",
    image: "image/jpeg",
  };
  return fallbacks[type] || "application/octet-stream";
}
