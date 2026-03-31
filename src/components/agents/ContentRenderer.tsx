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
    default:
      return (
        <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {content}
        </pre>
      );
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
            // Music cues: ♪
            if (text.startsWith("♪") || text.includes("♪")) {
              return (
                <p className="my-1.5 pl-3 border-l-2 border-[var(--color-accent)] text-[var(--color-accent)] italic">
                  {children}
                </p>
              );
            }
            // Action lines: △
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

// Flexible: dimensions can be { key: number } or { key: { score, notes } }
interface ReviewData {
  totalScore: number;
  passed: boolean;
  dimensions: Record<string, number | { score: number; notes: string }>;
  issues?: Array<string | { dimension: string; description: string; location: string; suggestion: string }>;
  compliance?: Record<string, string | boolean>;
}

const DIMENSION_LABELS: Record<string, string> = {
  // Review dimensions (screenplay)
  faithfulness: "忠实度",
  cinematicQuality: "影视感",
  pacing: "节奏感",
  humanness: "人味度",
  formatCompliance: "格式分",
  hookAndPaywall: "钩子与付费点",
  characterConsistency: "角色一致性",
  // Review dimensions (novel)
  proseQuality: "文笔质量",
  styleConsistency: "风格一致性",
  // Reflect dimensions
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
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{JSON.stringify(data, null, 2)}</pre>;
  }

  const dimCount = Object.keys(data.dimensions).length;
  const maxScore = dimCount * 10;
  const passThreshold = Math.round(maxScore * 0.7);
  const scoreColor = (data.totalScore ?? 0) >= passThreshold ? "var(--color-success)" : "var(--color-error)";

  return (
    <div className="space-y-5">
      {/* Total score header */}
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

      {/* 5 dimensions */}
      <div className="space-y-3">
        {Object.entries(data.dimensions).map(([key, dim]) => {
          // Handle both { score, notes } and plain number
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
              {/* Progress bar */}
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

      {/* Issues */}
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

      {/* Compliance */}
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
    // Handle nested structure: {storyboard: {...}, visualNarrative: {...}}
    data = parsed.storyboard ?? parsed;
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.scenes || !Array.isArray(data.scenes)) {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <div className="space-y-5">
      {/* Summary bar */}
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
                {/* Header: shot number + tags */}
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
                {/* Description */}
                <p className="text-[var(--color-text-secondary)] leading-relaxed">{shot.description}</p>
                {/* Color tone tag */}
                {shot.colorTone && (
                  <span className="inline-block rounded-full bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                    {shot.colorTone}
                  </span>
                )}
                {/* Dialogue */}
                {shot.dialogue && (
                  <p className="text-xs italic text-[var(--color-text-tertiary)] border-l-2 border-[var(--color-border-default)] pl-2">
                    {shot.dialogue}
                  </p>
                )}
                {/* Visual narrative */}
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
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <div className="space-y-4">
      {/* Character cards */}
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

      {/* Prompt cards */}
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
      {/* Header */}
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

      {/* Prompt text */}
      <p className="text-[var(--color-text-secondary)] leading-relaxed select-all">{prompt.prompt}</p>

      {/* Negative prompt (collapsible) */}
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

interface AnalysisCharacter {
  name: string;
  role?: string;
  identity?: string;
  appearance?: string;
  personality?: string[];
  arc?: string;
  aliases?: string[];
  relationships?: string[];
}

interface AnalysisData {
  genre?: { main?: string; tone?: string; subTags?: string[]; audience?: string };
  characters?: AnalysisCharacter[];
  themes?: string[];
  plotStructure?: { act1?: string; act2?: string; act3?: string } | string;
  emotionalCurve?: string;
  adaptationNotes?: string;
}

const ROLE_COLORS: Record<string, string> = {
  "主角": "bg-amber-100 text-amber-700",
  "配角": "bg-blue-100 text-blue-700",
  "反派": "bg-red-100 text-red-700",
};

function AnalysisRenderer({ content }: { content: string }) {
  let data: AnalysisData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  return (
    <div className="space-y-6">
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
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">🎯 {data.genre.audience}</p>
          )}
        </section>
      )}

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
                {char.appearance && <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">👤 {char.appearance}</p>}
                {char.arc && <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">📈 {char.arc}</p>}
                {char.relationships && char.relationships.length > 0 && (
                  <div className="text-xs text-[var(--color-text-tertiary)] space-y-0.5">
                    {char.relationships.map((r, i) => <p key={i}>🔗 {r}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.plotStructure && (
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

      {data.emotionalCurve && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">情绪曲线</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.emotionalCurve}</p>
        </section>
      )}
      {data.adaptationNotes && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">改编评估</h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.adaptationNotes}</p>
        </section>
      )}
    </div>
  );
}

// ─── Planning Renderer ──────────────────────────────────────────

interface PlanningData {
  totalEpisodes?: number;
  episodes?: Array<{
    number?: number;
    episodeNumber?: number;
    title?: string;
    summary?: string;
    outline?: string;
    keyScenes?: string[];
  }>;
}

function PlanningRenderer({ content }: { content: string }) {
  let data: PlanningData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  if (!data.episodes || !Array.isArray(data.episodes)) {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <div className="space-y-4">
      {data.totalEpisodes && (
        <p className="text-sm text-[var(--color-text-tertiary)]">共 {data.totalEpisodes} 集</p>
      )}
      <div className="space-y-3">
        {data.episodes.map((ep, idx) => {
          const num = ep.number ?? ep.episodeNumber ?? idx + 1;
          return (
            <div key={num} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-xs font-bold">{num}</span>
                <span className="font-medium text-[var(--color-text-primary)]">{ep.title ?? `第${num}集`}</span>
              </div>
              {(ep.summary || ep.outline) && (
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {ep.summary || (typeof ep.outline === "string" ? ep.outline : JSON.stringify(ep.outline))}
                </p>
              )}
              {ep.keyScenes && ep.keyScenes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ep.keyScenes.map((s, i) => (
                    <span key={i} className="rounded bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">{s}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Strategy Renderer ──────────────────────────────────────────

interface StrategyData {
  humanReadableSummary?: string;
  globalStyle?: { narrativeVoice?: string; toneAndRegister?: string; dialogueApproach?: string; pacing?: string };
  characterVoices?: Array<{ name?: string; voiceTraits?: string[] }>;
  nameMapping?: Record<string, { original: string; replacement: string }>;
  tabooPatterns?: string[];
  chapterPlans?: Array<{
    episodeNumber: number;
    focusPoints?: string[];
    keySceneTreatment?: string;
    emotionalArc?: string;
  }>;
}

function StrategyRenderer({ content }: { content: string }) {
  let data: StrategyData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{content}</pre>;
  }

  return (
    <div className="space-y-6">
      {data.humanReadableSummary && (
        <section className="rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{data.humanReadableSummary}</p>
        </section>
      )}

      {data.globalStyle && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">全局风格</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(data.globalStyle).map(([key, val]) => {
              const labels: Record<string, string> = { narrativeVoice: "叙事视角", toneAndRegister: "语调语域", dialogueApproach: "对话风格", pacing: "节奏" };
              return (
                <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{labels[key] || key}</span>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{val}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.characterVoices && data.characterVoices.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">角色声纹</h3>
          <div className="space-y-2">
            {data.characterVoices.map((cv, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-medium text-sm text-[var(--color-text-primary)] shrink-0">{cv.name || `角色${i + 1}`}</span>
                <div className="flex flex-wrap gap-1">
                  {cv.voiceTraits?.map((t) => (
                    <span key={t} className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.nameMapping && Object.keys(data.nameMapping).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">人名替换</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.values(data.nameMapping).map((m) => (
              <div key={m.original} className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-2 text-sm text-center">
                <span className="text-[var(--color-text-tertiary)] line-through">{m.original}</span>
                <span className="mx-2">→</span>
                <span className="text-[var(--color-text-primary)] font-medium">{m.replacement}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.tabooPatterns && data.tabooPatterns.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">禁忌模式</h3>
          <div className="flex flex-wrap gap-2">
            {data.tabooPatterns.map((t) => (
              <span key={t} className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-600">{t}</span>
            ))}
          </div>
        </section>
      )}

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
                {cp.emotionalArc && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">🎭 {cp.emotionalArc}</p>}
                {cp.keySceneTreatment && <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">🎬 {cp.keySceneTreatment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
