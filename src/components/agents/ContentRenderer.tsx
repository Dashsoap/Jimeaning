"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { ComparisonView } from "./ComparisonView";

// ─── Types ─────────────────────────────────────────────────────────

export type ContentType = "script" | "review" | "storyboard" | "imagePrompts" | "comparison" | "analysis" | "planning" | "strategy" | "raw";

interface ContentRendererProps {
  content: string;
  type: ContentType;
}

// ─── Generic JSON Fallback ─────────────────────────────────────────

function JsonFallback({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") {
    return <span className="text-sm text-[var(--color-text-secondary)]">{String(data)}</span>;
  }

  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">{key}</span>
          {typeof val === "object" && val !== null ? (
            <div className="mt-1 pl-3 border-l-2 border-[var(--color-border-default)]">
              <JsonFallback data={val} />
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Router ───────────────────────────────────────────────────

export function ContentRenderer({ content, type }: ContentRendererProps) {
  switch (type) {
    case "script":
      return <ScriptRenderer content={content} />;
    case "review":
      return <ReviewRenderer content={content} />;
    case "storyboard":
      return <StoryboardRenderer content={content} />;
    case "imagePrompts":
      return <ImagePromptsRenderer content={content} />;
    case "analysis":
      return <AnalysisRenderer content={content} />;
    case "planning":
      return <PlanningRenderer content={content} />;
    case "strategy":
      return <StrategyRenderer content={content} />;
    case "comparison": {
      try {
        const { original, rewritten } = JSON.parse(content) as { original: string; rewritten: string };
        return <ComparisonView originalText={original} rewrittenText={rewritten} />;
      } catch {
        return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
      }
    }
    default: {
      try {
        const parsed = JSON.parse(content);
        return <JsonFallback data={parsed} />;
      } catch {
        return (
          <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {content}
          </pre>
        );
      }
    }
  }
}

// ─── Script (Markdown) ────────────────────────────────────────────

function ScriptRenderer({ content }: { content: string }) {
  return (
    <div className="prose-script text-sm leading-relaxed text-[var(--color-text-secondary)]">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] mt-6 mb-3 border-b border-[var(--color-border-default)] pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mt-5 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-4 mb-1.5">
              {children}
            </h3>
          ),
          p: ({ children }) => {
            const text = String(children);
            if (text.startsWith("♪") || text.includes("♪")) {
              return (
                <p className="my-1.5 pl-3 border-l-2 border-[var(--color-accent)] text-[var(--color-accent)] italic">
                  {children}
                </p>
              );
            }
            if (text.startsWith("△") || text.includes("△")) {
              return (
                <p className="my-1.5 pl-3 text-[var(--color-text-tertiary)] italic">
                  {children}
                </p>
              );
            }
            return <p className="my-1.5">{children}</p>;
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[var(--color-text-tertiary)]">{children}</em>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          hr: () => <hr className="my-4 border-[var(--color-border-default)]" />,
          blockquote: ({ children }) => (
            <blockquote className="pl-3 border-l-2 border-[var(--color-border-default)] text-[var(--color-text-tertiary)] my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ─── Review Card ──────────────────────────────────────────────────

interface ReviewData {
  totalScore: number;
  passed: boolean;
  dimensions: Record<string, number | { score: number; notes: string }>;
  issues?: Array<string | { dimension: string; description: string; location: string; suggestion: string }>;
  compliance?: Record<string, string | boolean>;
}

const DIMENSION_LABELS: Record<string, string> = {
  faithfulness: "忠实度",
  cinematicQuality: "影视感",
  pacing: "节奏感",
  humanness: "人味度",
  formatCompliance: "格式分",
  hookAndPaywall: "钩子与付费点",
  characterConsistency: "角色一致性",
  proseQuality: "文笔质量",
  styleConsistency: "风格一致性",
  directness: "直接性",
  rhythm: "节奏",
  authenticity: "真实感",
  styleMatch: "风格匹配",
  conciseness: "简洁性",
  hookDensity: "钩子密度",
  characterVoice: "角色声纹",
  readerRetention: "读者留存",
};

const COMPLIANCE_LABELS: Record<string, string> = {
  sensitiveWords: "敏感词",
  valueOrientation: "价值导向",
  valueGuidance: "价值导向",
  platformRules: "平台规则",
};

function ReviewRenderer({ content }: { content: string }) {
  let data: ReviewData;
  try {
    data = JSON.parse(content) as ReviewData;
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.dimensions || typeof data.dimensions !== "object") {
    return <JsonFallback data={data} />;
  }

  const dimCount = Object.keys(data.dimensions).length;
  const maxScore = dimCount * 10;
  const passThreshold = Math.round(maxScore * 0.7);
  const scoreColor = (data.totalScore ?? 0) >= passThreshold ? "var(--color-success)" : "var(--color-error)";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="text-4xl font-bold" style={{ color: scoreColor }}>
          {data.totalScore}<span className="text-lg font-normal text-[var(--color-text-tertiary)]">/{maxScore}</span>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-medium"
          style={{
            backgroundColor: data.passed ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: data.passed ? "var(--color-success)" : "var(--color-error)",
          }}
        >
          {data.passed ? "通过" : "未通过"}
        </span>
      </div>

      <div className="space-y-3">
        {Object.entries(data.dimensions).map(([key, dim]) => {
          const score = typeof dim === "number" ? dim : dim.score;
          const notes = typeof dim === "object" ? dim.notes : null;
          return (
            <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {DIMENSION_LABELS[key] || key}
                </span>
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {score}/10
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-bg-primary)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${score * 10}%`,
                    backgroundColor: score >= 7 ? "var(--color-success)" : score >= 5 ? "var(--color-accent)" : "var(--color-error)",
                  }}
                />
              </div>
              {notes && <p className="mt-2 text-xs text-[var(--color-text-tertiary)] leading-relaxed">{notes}</p>}
            </div>
          );
        })}
      </div>

      {data.issues && data.issues.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">修改建议</h4>
          <div className="space-y-2">
            {data.issues.map((issue, i) => (
              <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm">
                {typeof issue === "string" ? (
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">{issue}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded bg-[var(--color-accent-bg)] px-1.5 py-0.5 text-xs text-[var(--color-accent)]">
                        {DIMENSION_LABELS[issue.dimension] || issue.dimension}
                      </span>
                      {issue.location && (
                        <span className="text-xs text-[var(--color-text-tertiary)]">{issue.location}</span>
                      )}
                    </div>
                    <p className="text-[var(--color-text-secondary)]">{issue.description}</p>
                    {issue.suggestion && (
                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">建议：{issue.suggestion}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.compliance && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">合规检查</h4>
          <div className="space-y-1.5 text-sm">
            {Object.entries(data.compliance).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-[var(--color-text-tertiary)] shrink-0">
                  {COMPLIANCE_LABELS[key] || key}：
                </span>
                <span className="text-[var(--color-text-secondary)]">
                  {typeof val === "boolean" ? (val ? "通过" : "未通过") : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Storyboard Grid ─────────────────────────────────────────────

interface StoryboardData {
  totalShots?: number;
  estimatedDuration?: string;
  scenes: Array<{
    sceneHeader: string;
    shots: Array<{
      shotNumber: number;
      shotSize: string;
      angle: string;
      cameraMove: string;
      description: string;
      dialogue?: string;
      soundEffect?: string;
      duration: string;
      colorTone: string;
      composition: string;
      visualNarrative?: string;
    }>;
  }>;
}

function StoryboardRenderer({ content }: { content: string }) {
  let data: StoryboardData;
  try {
    const parsed = JSON.parse(content);
    data = parsed.storyboard ?? parsed;
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.scenes || !Array.isArray(data.scenes)) {
    return <JsonFallback data={data} />;
  }

  return (
    <div className="space-y-5">
      {(data.totalShots || data.estimatedDuration) && (
        <div className="flex gap-4 text-sm text-[var(--color-text-tertiary)]">
          {data.totalShots && <span>共 {data.totalShots} 镜</span>}
          {data.estimatedDuration && <span>预估时长 {data.estimatedDuration}</span>}
        </div>
      )}

      {data.scenes.map((scene, si) => (
        <div key={si}>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 pb-1 border-b border-[var(--color-border-default)]">
            {scene.sceneHeader}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scene.shots.map((shot) => (
              <div
                key={shot.shotNumber}
                className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm space-y-1.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-accent)]">#{shot.shotNumber}</span>
                  <span className="rounded bg-[var(--color-accent-bg)] px-1.5 py-0.5 text-xs text-[var(--color-accent)]">
                    {shot.shotSize}
                  </span>
                  <span className="rounded bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {shot.angle}
                  </span>
                  <span className="rounded bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {shot.cameraMove}
                  </span>
                  {shot.duration && (
                    <span className="text-xs text-[var(--color-text-tertiary)]">{shot.duration}</span>
                  )}
                </div>
                <p className="text-[var(--color-text-secondary)] leading-relaxed">{shot.description}</p>
                {shot.colorTone && (
                  <span className="inline-block rounded-full bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {shot.colorTone}
                  </span>
                )}
                {shot.dialogue && (
                  <p className="text-xs italic text-[var(--color-text-tertiary)] border-l-2 border-[var(--color-border-default)] pl-2">
                    {shot.dialogue}
                  </p>
                )}
                {shot.visualNarrative && (
                  <p className="text-xs text-[var(--color-accent)] mt-1">
                    {shot.visualNarrative}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Image Prompts Cards ─────────────────────────────────────────

interface ImagePromptsData {
  characterCards?: Array<{ name: string; description: string }>;
  prompts: Array<{
    shotNumber: number;
    sceneHeader: string;
    prompt: string;
    negativePrompt: string;
    aspectRatio?: string;
  }>;
}

function ImagePromptsRenderer({ content }: { content: string }) {
  let data: ImagePromptsData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.prompts || !Array.isArray(data.prompts)) {
    return <JsonFallback data={data} />;
  }

  return (
    <div className="space-y-4">
      {data.characterCards && data.characterCards.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">角色描述卡</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.characterCards.map((c, i) => (
              <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{c.name}</span>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)] leading-relaxed">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {data.prompts.map((p) => (
          <PromptCard key={p.shotNumber} prompt={p} />
        ))}
      </div>
    </div>
  );
}

function PromptCard({
  prompt,
}: {
  prompt: ImagePromptsData["prompts"][number];
}) {
  const [copied, setCopied] = useState(false);
  const [showNeg, setShowNeg] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--color-accent)]">#{prompt.shotNumber}</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">{prompt.sceneHeader}</span>
          {prompt.aspectRatio && (
            <span className="rounded bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
              {prompt.aspectRatio}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="text-[var(--color-text-secondary)] leading-relaxed select-all">{prompt.prompt}</p>
      {prompt.negativePrompt && (
        <div className="mt-2">
          <button
            onClick={() => setShowNeg(!showNeg)}
            className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] cursor-pointer"
          >
            {showNeg ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Negative Prompt
          </button>
          {showNeg && (
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)] leading-relaxed pl-4">
              {prompt.negativePrompt}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analysis Renderer ──────────────────────────────────────────
// Matches: novel-analyzer agent output (AnalysisResult)

interface AnalysisCharacter {
  name: string;
  role?: string;
  identity?: string;
  appearance?: string;
  personality?: string[];
  arc?: string;
  aliases?: string[];
  relationships?: Array<string | { target: string; type: string; description: string }>;
}

interface AnalysisData {
  genre?: { main?: string; tone?: string; subTags?: string[]; audience?: string };
  characters?: AnalysisCharacter[];
  themes?: string[];
  // Actual field names from novel-analyzer
  plotSkeleton?: {
    oneLiner?: string;
    coreConflict?: string;
    turningPoints?: Array<{ event: string; position: string; impact: string }>;
    subplots?: Array<{ name: string; description: string; intersect: string }>;
  };
  emotionCurve?: Array<{ range: string; direction: string; event: string; beat: string }>;
  adaptationAssessment?: {
    visualDifficulty?: string;
    dialogueRatio?: string;
    sceneCount?: number;
    recommendedEpisodes?: string;
    innerMonologueRatio?: string;
    cutSuggestions?: string[];
    addSuggestions?: string[];
  };
  highlights?: Array<{
    name: string;
    position: string;
    excerpt?: string;
    visualPotential?: number;
    suggestion: string;
  }>;
  // Legacy fallback fields
  plotStructure?: { act1?: string; act2?: string; act3?: string } | string;
  emotionalCurve?: string;
  adaptationNotes?: string;
}

const ROLE_COLORS: Record<string, string> = {
  "主角": "bg-amber-100 text-amber-700",
  "配角": "bg-blue-100 text-blue-700",
  "反派": "bg-red-100 text-red-700",
};

const DIRECTION_LABELS: Record<string, string> = {
  "📈": "上升",
  "📉": "下降",
  "💥": "爆发",
  "💔": "心碎",
  "😍": "甜蜜",
};

function AnalysisRenderer({ content }: { content: string }) {
  let data: AnalysisData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  // If no recognizable fields at all, use fallback
  if (!data.genre && !data.characters && !data.plotSkeleton && !data.plotStructure && !data.emotionCurve && !data.emotionalCurve) {
    return <JsonFallback data={data} />;
  }

  return (
    <div className="space-y-6">
      {/* Genre */}
      {data.genre && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">题材分类</h3>
          <div className="flex flex-wrap gap-2">
            {data.genre.main && (
              <span className="rounded-full bg-[var(--color-accent-bg)] px-3 py-1 text-sm font-medium text-[var(--color-accent)]">{data.genre.main}</span>
            )}
            {data.genre.tone && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">{data.genre.tone}</span>
            )}
            {data.genre.subTags?.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--color-bg-surface)] px-3 py-1 text-sm text-[var(--color-text-secondary)]">{tag}</span>
            ))}
          </div>
          {data.genre.audience && (
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">目标受众：{data.genre.audience}</p>
          )}
        </section>
      )}

      {/* Themes */}
      {data.themes && data.themes.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">主题</h3>
          <div className="flex flex-wrap gap-2">
            {data.themes.map((theme) => (
              <span key={theme} className="rounded-full border border-[var(--color-border-default)] px-3 py-1 text-sm text-[var(--color-text-secondary)]">{theme}</span>
            ))}
          </div>
        </section>
      )}

      {/* Characters */}
      {data.characters && data.characters.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">角色 ({data.characters.length})</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.characters.map((char) => (
              <div key={char.name} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[var(--color-text-primary)]">{char.name}</span>
                  {char.aliases?.map((a) => (
                    <span key={a} className="text-xs text-[var(--color-text-tertiary)]">({a})</span>
                  ))}
                  {char.role && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[char.role] || "bg-gray-100 text-gray-600"}`}>{char.role}</span>
                  )}
                </div>
                {char.identity && <p className="text-sm text-[var(--color-text-secondary)]">{char.identity}</p>}
                {char.personality && char.personality.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {char.personality.map((p) => (
                      <span key={p} className="rounded bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">{p}</span>
                    ))}
                  </div>
                )}
                {char.appearance && <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">外貌：{char.appearance}</p>}
                {char.arc && <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">人物弧光：{char.arc}</p>}
                {char.relationships && char.relationships.length > 0 && (
                  <div className="text-xs text-[var(--color-text-tertiary)] space-y-0.5">
                    {char.relationships.map((r, i) => (
                      <p key={i}>
                        {typeof r === "string" ? r : `${r.target}（${r.type}）：${r.description}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plot Skeleton (new format) */}
      {data.plotSkeleton && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">情节骨架</h3>
          {data.plotSkeleton.oneLiner && (
            <p className="text-sm text-[var(--color-accent)] font-medium mb-2">{data.plotSkeleton.oneLiner}</p>
          )}
          {data.plotSkeleton.coreConflict && (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 mb-3">
              <span className="text-xs text-[var(--color-text-tertiary)]">核心冲突</span>
              <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{data.plotSkeleton.coreConflict}</p>
            </div>
          )}
          {data.plotSkeleton.turningPoints && data.plotSkeleton.turningPoints.length > 0 && (
            <div className="space-y-2 mb-3">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">转折点</span>
              {data.plotSkeleton.turningPoints.map((tp, i) => (
                <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 flex items-start gap-3">
                  <span className="shrink-0 rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-xs text-[var(--color-accent)] font-medium">{tp.position}</span>
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">{tp.event}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{tp.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.plotSkeleton.subplots && data.plotSkeleton.subplots.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">支线</span>
              {data.plotSkeleton.subplots.map((sp, i) => (
                <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{sp.name}</span>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sp.description}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">交汇：{sp.intersect}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Plot Structure (legacy fallback) */}
      {!data.plotSkeleton && data.plotStructure && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">情节骨架</h3>
          {typeof data.plotStructure === "string" ? (
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.plotStructure}</p>
          ) : (
            <div className="space-y-2">
              {data.plotStructure.act1 && <p className="text-sm text-[var(--color-text-secondary)]"><strong>开端：</strong>{data.plotStructure.act1}</p>}
              {data.plotStructure.act2 && <p className="text-sm text-[var(--color-text-secondary)]"><strong>发展：</strong>{data.plotStructure.act2}</p>}
              {data.plotStructure.act3 && <p className="text-sm text-[var(--color-text-secondary)]"><strong>结局：</strong>{data.plotStructure.act3}</p>}
            </div>
          )}
        </section>
      )}

      {/* Emotion Curve (new format: array) */}
      {data.emotionCurve && Array.isArray(data.emotionCurve) && data.emotionCurve.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">情绪曲线</h3>
          <div className="space-y-2">
            {data.emotionCurve.map((ec, i) => (
              <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 flex items-start gap-3">
                <div className="shrink-0 text-center">
                  <span className="text-lg">{ec.direction}</span>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{DIRECTION_LABELS[ec.direction] || ""}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--color-accent)]">{ec.range}</span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{ec.beat}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{ec.event}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Emotional Curve (legacy: string) */}
      {!data.emotionCurve && data.emotionalCurve && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">情绪曲线</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.emotionalCurve}</p>
        </section>
      )}

      {/* Adaptation Assessment (new format: object) */}
      {data.adaptationAssessment && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">改编评估</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {data.adaptationAssessment.visualDifficulty && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">视觉化难度</span>
                <p className="text-sm text-[var(--color-text-primary)] font-medium mt-0.5">{data.adaptationAssessment.visualDifficulty}</p>
              </div>
            )}
            {data.adaptationAssessment.dialogueRatio && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">对话占比</span>
                <p className="text-sm text-[var(--color-text-primary)] font-medium mt-0.5">{data.adaptationAssessment.dialogueRatio}</p>
              </div>
            )}
            {data.adaptationAssessment.sceneCount != null && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">场景数</span>
                <p className="text-sm text-[var(--color-text-primary)] font-medium mt-0.5">{data.adaptationAssessment.sceneCount}</p>
              </div>
            )}
            {data.adaptationAssessment.recommendedEpisodes && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">建议集数</span>
                <p className="text-sm text-[var(--color-text-primary)] font-medium mt-0.5">{data.adaptationAssessment.recommendedEpisodes}</p>
              </div>
            )}
            {data.adaptationAssessment.innerMonologueRatio && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">心理描写占比</span>
                <p className="text-sm text-[var(--color-text-primary)] font-medium mt-0.5">{data.adaptationAssessment.innerMonologueRatio}</p>
              </div>
            )}
          </div>
          {data.adaptationAssessment.cutSuggestions && data.adaptationAssessment.cutSuggestions.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-[var(--color-error)]">建议删减</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.adaptationAssessment.cutSuggestions.map((s, i) => (
                  <span key={i} className="rounded bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600">{s}</span>
                ))}
              </div>
            </div>
          )}
          {data.adaptationAssessment.addSuggestions && data.adaptationAssessment.addSuggestions.length > 0 && (
            <div>
              <span className="text-xs font-medium text-[var(--color-success)]">建议增加</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.adaptationAssessment.addSuggestions.map((s, i) => (
                  <span key={i} className="rounded bg-green-50 border border-green-200 px-2 py-0.5 text-xs text-green-600">{s}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Adaptation Notes (legacy: string) */}
      {!data.adaptationAssessment && data.adaptationNotes && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">改编评估</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.adaptationNotes}</p>
        </section>
      )}

      {/* Highlights */}
      {data.highlights && data.highlights.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">高光场景</h3>
          <div className="space-y-2">
            {data.highlights.map((h, i) => (
              <div key={i} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-[var(--color-text-primary)]">{h.name}</span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">{h.position}</span>
                  {h.visualPotential != null && (
                    <span className="text-xs text-[var(--color-accent)]">
                      {"★".repeat(h.visualPotential)}{"☆".repeat(5 - h.visualPotential)}
                    </span>
                  )}
                </div>
                {h.excerpt && <p className="text-xs text-[var(--color-text-tertiary)] italic mb-1">&ldquo;{h.excerpt}&rdquo;</p>}
                <p className="text-sm text-[var(--color-text-secondary)]">{h.suggestion}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Planning Renderer ──────────────────────────────────────────
// Matches: episode-architect agent output (EpisodeOutline)

interface PlanningEpisode {
  number?: number;
  episodeNumber?: number;
  title?: string;
  synopsis?: string;
  summary?: string;
  outline?: string;
  sourceRange?: { start: number; end: number };
  sourceLength?: number;
  openingHook?: { type: string; description: string };
  scenes?: Array<{ name: string; summary: string }>;
  highlight?: { type: string; description: string };
  endingCliffhanger?: string;
  emotionArc?: string;
  keyScenes?: string[];
}

interface PlanningData {
  totalEpisodes?: number;
  estimatedTotalMinutes?: number;
  episodes?: PlanningEpisode[];
  paywallSuggestion?: { freeEpisodes: number; hookEpisode: number; reason: string };
}

const HOOK_TYPE_COLORS: Record<string, string> = {
  "冲突钩": "bg-red-50 text-red-600 border-red-200",
  "反转钩": "bg-purple-50 text-purple-600 border-purple-200",
  "危机钩": "bg-orange-50 text-orange-600 border-orange-200",
  "情感钩": "bg-pink-50 text-pink-600 border-pink-200",
  "悬念钩": "bg-blue-50 text-blue-600 border-blue-200",
};

function PlanningRenderer({ content }: { content: string }) {
  let data: PlanningData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.episodes || !Array.isArray(data.episodes)) {
    return <JsonFallback data={data} />;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 text-sm text-[var(--color-text-tertiary)]">
        {data.totalEpisodes && <span>共 {data.totalEpisodes} 集</span>}
        {data.estimatedTotalMinutes != null && data.estimatedTotalMinutes > 0 && (
          <span>预估总时长 {data.estimatedTotalMinutes} 分钟</span>
        )}
      </div>

      {/* Episode cards */}
      <div className="space-y-3">
        {data.episodes.map((ep, idx) => {
          const num = ep.number ?? ep.episodeNumber ?? idx + 1;
          const description = ep.synopsis || ep.summary || (typeof ep.outline === "string" ? ep.outline : null);
          return (
            <EpisodePlanCard key={num} num={num} ep={ep} description={description} />
          );
        })}
      </div>

      {/* Paywall suggestion */}
      {data.paywallSuggestion && (
        <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 p-4">
          <h4 className="text-sm font-medium text-amber-700 mb-1">付费墙建议</h4>
          <p className="text-sm text-amber-600">
            免费前 {data.paywallSuggestion.freeEpisodes} 集，第 {data.paywallSuggestion.hookEpisode} 集设钩
          </p>
          <p className="text-xs text-amber-500 mt-1">{data.paywallSuggestion.reason}</p>
        </div>
      )}
    </div>
  );
}

function EpisodePlanCard({ num, ep, description }: { num: number; ep: PlanningEpisode; description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = ep.scenes || ep.openingHook || ep.highlight || ep.endingCliffhanger || ep.emotionArc;

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-xs font-bold">{num}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--color-text-primary)]">{ep.title ?? `第${num}集`}</span>
            {ep.openingHook && (
              <span className={`rounded border px-1.5 py-0.5 text-xs ${HOOK_TYPE_COLORS[ep.openingHook.type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                {ep.openingHook.type}
              </span>
            )}
            {ep.sourceLength != null && (
              <span className="text-xs text-[var(--color-text-tertiary)]">{Math.round(ep.sourceLength / 1000)}K字</span>
            )}
          </div>
          {description && (
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mt-1">{description}</p>
          )}

          {/* Expandable details */}
          {hasDetails && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {expanded ? "收起" : "展开详情"}
              </button>
              {expanded && (
                <div className="mt-2 space-y-2 pl-1 border-l-2 border-[var(--color-border-default)]">
                  {ep.openingHook && (
                    <div className="pl-3">
                      <span className="text-xs font-medium text-[var(--color-text-tertiary)]">开篇钩子</span>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{ep.openingHook.description}</p>
                    </div>
                  )}
                  {ep.scenes && ep.scenes.length > 0 && (
                    <div className="pl-3">
                      <span className="text-xs font-medium text-[var(--color-text-tertiary)]">场景 ({ep.scenes.length})</span>
                      <div className="mt-1 space-y-1">
                        {ep.scenes.map((s, i) => (
                          <div key={i} className="text-xs text-[var(--color-text-secondary)]">
                            <span className="font-medium">{s.name}</span>：{s.summary}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ep.highlight && (
                    <div className="pl-3">
                      <span className="text-xs font-medium text-[var(--color-text-tertiary)]">高光</span>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">[{ep.highlight.type}] {ep.highlight.description}</p>
                    </div>
                  )}
                  {ep.emotionArc && (
                    <div className="pl-3">
                      <span className="text-xs font-medium text-[var(--color-text-tertiary)]">情绪弧线</span>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{ep.emotionArc}</p>
                    </div>
                  )}
                  {ep.endingCliffhanger && (
                    <div className="pl-3">
                      <span className="text-xs font-medium text-[var(--color-text-tertiary)]">结尾悬念</span>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{ep.endingCliffhanger}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Legacy: keyScenes */}
          {ep.keyScenes && ep.keyScenes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {ep.keyScenes.map((s, i) => (
                <span key={i} className="rounded bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Strategy Renderer ──────────────────────────────────────────
// Matches: rewrite-strategist agent output (RewriteStrategy)

interface StrategyData {
  humanReadableSummary?: string;
  globalStyle?: {
    narrativeVoice?: string;
    toneAndRegister?: string;
    sentenceRhythm?: string;
    dialogueApproach?: string;
    tabooPatterns?: string[];
  };
  nameMapping?: {
    characters?: Record<string, string>;
    locations?: Record<string, string>;
    organizations?: Record<string, string>;
  };
  characterVoices?: Record<string, {
    speechStyle?: string;
    innerWorld?: string;
    uniqueMarkers?: string;
  }>;
  chapterPlans?: Array<{
    episodeNumber: number;
    focusPoints?: string[];
    transitionFromPrev?: string;
    transitionToNext?: string;
    keySceneTreatment?: string;
    emotionalArc?: string;
  }>;
  coherenceRules?: {
    recurringMotifs?: string[];
    timelineConsistency?: string;
    characterArcProgression?: string;
    foreshadowingNotes?: string[];
  };
  // Legacy fields
  tabooPatterns?: string[];
}

const STYLE_LABELS: Record<string, string> = {
  narrativeVoice: "叙事视角",
  toneAndRegister: "语调语域",
  sentenceRhythm: "句式节奏",
  dialogueApproach: "对话风格",
};

function StrategyRenderer({ content }: { content: string }) {
  let data: StrategyData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  // Collect taboo patterns from either location
  const tabooPatterns = data.globalStyle?.tabooPatterns ?? data.tabooPatterns ?? [];

  return (
    <div className="space-y-6">
      {/* Summary */}
      {data.humanReadableSummary && (
        <section className="rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.humanReadableSummary}</p>
        </section>
      )}

      {/* Global Style */}
      {data.globalStyle && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">全局风格</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(data.globalStyle)
              .filter(([key]) => key !== "tabooPatterns")
              .map(([key, val]) => (
                <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{STYLE_LABELS[key] || key}</span>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{String(val)}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Name Mapping */}
      {data.nameMapping && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">名称替换</h3>
          {data.nameMapping.characters && Object.keys(data.nameMapping.characters).length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-[var(--color-text-tertiary)] mb-1 block">角色</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(data.nameMapping.characters).map(([orig, repl]) => (
                  <div key={orig} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-2 text-sm text-center">
                    <span className="text-[var(--color-text-tertiary)] line-through">{orig}</span>
                    <span className="mx-2">→</span>
                    <span className="text-[var(--color-text-primary)] font-medium">{repl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.nameMapping.locations && Object.keys(data.nameMapping.locations).length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-[var(--color-text-tertiary)] mb-1 block">地名</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(data.nameMapping.locations).map(([orig, repl]) => (
                  <div key={orig} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-2 text-sm text-center">
                    <span className="text-[var(--color-text-tertiary)] line-through">{orig}</span>
                    <span className="mx-2">→</span>
                    <span className="text-[var(--color-text-primary)] font-medium">{repl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.nameMapping.organizations && Object.keys(data.nameMapping.organizations).length > 0 && (
            <div>
              <span className="text-xs text-[var(--color-text-tertiary)] mb-1 block">组织</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(data.nameMapping.organizations).map(([orig, repl]) => (
                  <div key={orig} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-2 text-sm text-center">
                    <span className="text-[var(--color-text-tertiary)] line-through">{orig}</span>
                    <span className="mx-2">→</span>
                    <span className="text-[var(--color-text-primary)] font-medium">{repl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Character Voices */}
      {data.characterVoices && Object.keys(data.characterVoices).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">角色声纹</h3>
          <div className="space-y-2">
            {Object.entries(data.characterVoices).map(([name, voice]) => (
              <div key={name} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="font-medium text-sm text-[var(--color-text-primary)]">{name}</span>
                <div className="mt-1.5 space-y-1 text-xs text-[var(--color-text-secondary)]">
                  {voice.speechStyle && <p>说话风格：{voice.speechStyle}</p>}
                  {voice.innerWorld && <p>内心世界：{voice.innerWorld}</p>}
                  {voice.uniqueMarkers && <p>独特标记：{voice.uniqueMarkers}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Taboo Patterns */}
      {tabooPatterns.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">禁忌模式</h3>
          <div className="flex flex-wrap gap-2">
            {tabooPatterns.map((t) => (
              <span key={t} className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-600">{t}</span>
            ))}
          </div>
        </section>
      )}

      {/* Coherence Rules */}
      {data.coherenceRules && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">连贯性规则</h3>
          <div className="space-y-2">
            {data.coherenceRules.timelineConsistency && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">时间线一致性</span>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{data.coherenceRules.timelineConsistency}</p>
              </div>
            )}
            {data.coherenceRules.characterArcProgression && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                <span className="text-xs text-[var(--color-text-tertiary)]">角色弧光推进</span>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{data.coherenceRules.characterArcProgression}</p>
              </div>
            )}
            {data.coherenceRules.recurringMotifs && data.coherenceRules.recurringMotifs.length > 0 && (
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">复现母题</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.coherenceRules.recurringMotifs.map((m, i) => (
                    <span key={i} className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {data.coherenceRules.foreshadowingNotes && data.coherenceRules.foreshadowingNotes.length > 0 && (
              <div>
                <span className="text-xs text-[var(--color-text-tertiary)]">伏笔备注</span>
                <div className="mt-1 space-y-1">
                  {data.coherenceRules.foreshadowingNotes.map((n, i) => (
                    <p key={i} className="text-xs text-[var(--color-text-secondary)] pl-2 border-l-2 border-[var(--color-border-default)]">{n}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Chapter Plans */}
      {data.chapterPlans && data.chapterPlans.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">分集策略</h3>
          <div className="space-y-2">
            {data.chapterPlans.map((cp) => (
              <div key={cp.episodeNumber} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm">
                <span className="font-medium text-[var(--color-text-primary)]">第{cp.episodeNumber}集</span>
                {cp.focusPoints && cp.focusPoints.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cp.focusPoints.map((f, i) => (
                      <span key={i} className="rounded bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">{f}</span>
                    ))}
                  </div>
                )}
                {cp.emotionalArc && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">情绪弧线：{cp.emotionalArc}</p>}
                {cp.keySceneTreatment && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">关键场景：{cp.keySceneTreatment}</p>}
                {cp.transitionFromPrev && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">承接上集：{cp.transitionFromPrev}</p>}
                {cp.transitionToNext && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">引出下集：{cp.transitionToNext}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
