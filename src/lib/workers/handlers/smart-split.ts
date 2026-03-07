import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import {
  DETECT_CONTENT_TYPE_SYSTEM,
  DETECT_CONTENT_TYPE_USER,
  SCAN_CHAPTER_BOUNDARIES_SYSTEM,
  SCAN_CHAPTER_BOUNDARIES_USER,
  GENERATE_CHAPTER_SUMMARY_SYSTEM,
  GENERATE_CHAPTER_SUMMARY_USER,
} from "@/lib/llm/prompts/smart-split";
import { resolveLlmConfig, resolveProviderConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

// ─── Types ─────────────────────────────────────────────────────────────

interface ContentTypeResult {
  type: "novel" | "script" | "other";
  confidence: number;
  reason: string;
}

interface BoundaryResult {
  boundaries: Array<{
    position: number;
    title: string;
    reason: string;
  }>;
}

interface ChapterSummaryResult {
  title: string;
  summary: string;
  characters: string[];
  keyEvents: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────

const SAMPLE_LENGTH = 3000;
const SEGMENT_SIZE = 50000;
const OVERLAP_SIZE = 5000;
const DEDUP_THRESHOLD = 500;
const MAX_PARALLEL_SCANS = 10;

// ─── Regex Chapter Detection ───────────────────────────────────────────

const CHAPTER_PATTERNS = [
  /第[一二三四五六七八九十百千\d]+[章节回集幕]/g,
  /Chapter\s+\d+/gi,
  /Episode\s+\d+/gi,
  /^#{1,3}\s+.+$/gm,
  /^={3,}\s*$/gm,
];

function detectChaptersByRegex(content: string): number[] {
  const positions: number[] = [];

  for (const pattern of CHAPTER_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      positions.push(match.index);
    }
  }

  if (positions.length < 2) return [];

  // Sort and deduplicate
  const sorted = [...new Set(positions)].sort((a, b) => a - b);

  // Remove positions that are too close together
  const deduped: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - deduped[deduped.length - 1] > DEDUP_THRESHOLD) {
      deduped.push(sorted[i]);
    }
  }

  return deduped;
}

// ─── Segment Splitting ─────────────────────────────────────────────────

function splitIntoSegments(content: string): Array<{ text: string; offset: number }> {
  const segments: Array<{ text: string; offset: number }> = [];

  if (content.length <= SEGMENT_SIZE) {
    segments.push({ text: content, offset: 0 });
    return segments;
  }

  let pos = 0;
  while (pos < content.length) {
    const end = Math.min(pos + SEGMENT_SIZE, content.length);
    segments.push({ text: content.substring(pos, end), offset: pos });
    pos = end - OVERLAP_SIZE;
    if (pos + OVERLAP_SIZE >= content.length) break;
  }

  return segments;
}

// ─── Merge and Deduplicate Boundaries ───────────────────────────────────

function mergeBoundaries(
  allBoundaries: Array<{ position: number; title: string; reason: string }>,
): Array<{ position: number; title: string; reason: string }> {
  if (allBoundaries.length === 0) return [];

  const sorted = [...allBoundaries].sort((a, b) => a.position - b.position);
  const merged: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].position - last.position <= DEDUP_THRESHOLD) {
      // Keep the one with longer title (more descriptive)
      if (sorted[i].title.length > last.title.length) {
        merged[merged.length - 1] = sorted[i];
      }
    } else {
      merged.push(sorted[i]);
    }
  }

  return merged;
}

// ─── Worker Handler ─────────────────────────────────────────────────────

export const handleSmartSplit = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const content = data.content as string;
  const analysisModelKey = data.analysisModelKey as string | undefined;
  const targetDuration = data.targetDuration as string | undefined;
  const targetEpisodes = data.targetEpisodes as number | undefined;
  const direction = data.direction as string | undefined;

  if (!content) {
    throw new Error("Missing required field: content");
  }

  // 1. Detect content type
  ctx.publishText("正在检测内容类型...\n");
  await ctx.reportProgress(5);

  let llmCfg: { apiKey: string; baseUrl?: string; model: string };
  if (analysisModelKey) {
    const resolved = await resolveProviderConfig(userId, "llm", analysisModelKey);
    llmCfg = {
      apiKey: resolved.config.apiKey,
      baseUrl: resolved.config.baseUrl,
      model: resolved.config.model || "",
    };
  } else {
    llmCfg = await resolveLlmConfig(userId);
  }
  const client = createLLMClient(llmCfg);

  const sample = content.substring(0, SAMPLE_LENGTH);
  const contentTypeResult = await chatCompletionJson<ContentTypeResult>(client, {
    model: llmCfg.model,
    systemPrompt: DETECT_CONTENT_TYPE_SYSTEM,
    userPrompt: DETECT_CONTENT_TYPE_USER(sample),
    temperature: 0.2,
  });

  const contentType = contentTypeResult.type || "novel";
  ctx.publishText(`内容类型: ${contentType} (置信度: ${Math.round((contentTypeResult.confidence || 0) * 100)}%)\n`);
  await ctx.reportProgress(10);

  // 2. Try regex-based chapter detection first
  ctx.publishText("正在检测章节标记...\n");
  const regexPositions = detectChaptersByRegex(content);

  let boundaries: Array<{ position: number; title: string; reason: string }>;

  if (regexPositions.length >= 2) {
    // Regex succeeded
    ctx.publishText(`检测到 ${regexPositions.length} 个章节标记，使用正则分章\n`);
    boundaries = regexPositions.map((pos) => {
      // Extract title from the text around the position
      const lineEnd = content.indexOf("\n", pos);
      const title = content.substring(pos, lineEnd > pos ? lineEnd : pos + 50).trim();
      return { position: pos, title, reason: "regex" };
    });
    await ctx.reportProgress(50);
  } else {
    // 3. AI-based scanning with overlapping windows
    const segments = splitIntoSegments(content);
    ctx.publishText(`未检测到明显章节标记，启动 AI 扫描（共 ${segments.length} 段）...\n`);

    const allBoundaries: Array<{ position: number; title: string; reason: string }> = [];

    // Process in batches to avoid overloading
    for (let batchStart = 0; batchStart < segments.length; batchStart += MAX_PARALLEL_SCANS) {
      const batch = segments.slice(batchStart, batchStart + MAX_PARALLEL_SCANS);

      const results = await Promise.all(
        batch.map(async (seg, idx) => {
          const globalIdx = batchStart + idx;
          ctx.publishText(`正在扫描第 ${globalIdx + 1}/${segments.length} 段...\n`);

          const result = await chatCompletionJson<BoundaryResult>(client, {
            model: llmCfg.model,
            systemPrompt: SCAN_CHAPTER_BOUNDARIES_SYSTEM,
            userPrompt: SCAN_CHAPTER_BOUNDARIES_USER(seg.text, globalIdx, segments.length, {
              targetEpisodes,
              targetDuration,
              direction,
            }),
            temperature: 0.3,
          });

          // Adjust positions to global offsets
          return (result.boundaries || []).map((b) => ({
            ...b,
            position: b.position + seg.offset,
          }));
        }),
      );

      for (const segBoundaries of results) {
        allBoundaries.push(...segBoundaries);
      }

      const progress = 10 + Math.round(((batchStart + batch.length) / segments.length) * 40);
      await ctx.reportProgress(progress);
    }

    boundaries = mergeBoundaries(allBoundaries);
    ctx.publishText(`AI 扫描完成，找到 ${boundaries.length} 个章节边界\n`);
    await ctx.reportProgress(50);
  }

  // 4. Split content into chapters
  if (boundaries.length === 0) {
    // No boundaries found — treat entire content as single chapter
    boundaries = [{ position: 0, title: "全文", reason: "no boundaries found" }];
  }

  // Ensure first boundary starts at 0
  if (boundaries[0].position > DEDUP_THRESHOLD) {
    boundaries.unshift({ position: 0, title: "序章", reason: "prepend start" });
  }

  const chapters: Array<{
    index: number;
    title: string;
    summary: string;
    content: string;
    startPos: number;
    endPos: number;
  }> = [];

  ctx.publishText("正在生成章节摘要...\n");

  for (let i = 0; i < boundaries.length; i++) {
    const startPos = boundaries[i].position;
    const endPos = i + 1 < boundaries.length ? boundaries[i + 1].position : content.length;
    const chapterContent = content.substring(startPos, endPos);

    // Generate summary for each chapter
    let title = boundaries[i].title;
    let summary = "";

    try {
      const summaryContent = chapterContent.substring(0, 5000);
      const summaryResult = await chatCompletionJson<ChapterSummaryResult>(client, {
        model: llmCfg.model,
        systemPrompt: GENERATE_CHAPTER_SUMMARY_SYSTEM,
        userPrompt: GENERATE_CHAPTER_SUMMARY_USER(summaryContent, title),
        temperature: 0.3,
      });

      title = summaryResult.title || title;
      summary = summaryResult.summary || "";
    } catch {
      // Keep original title, no summary
    }

    chapters.push({
      index: i + 1,
      title,
      summary,
      content: chapterContent,
      startPos,
      endPos,
    });

    const progress = 50 + Math.round(((i + 1) / boundaries.length) * 40);
    await ctx.reportProgress(progress);
    ctx.publishText(`章节 ${i + 1}/${boundaries.length}: ${title} (${chapterContent.length} 字)\n`);
  }

  await ctx.reportProgress(100);
  ctx.publishText(`\n分章完成! 共 ${chapters.length} 章\n`);

  return {
    contentType,
    contentTypeConfidence: contentTypeResult.confidence,
    contentTypeReason: contentTypeResult.reason,
    chapters,
  };
});
