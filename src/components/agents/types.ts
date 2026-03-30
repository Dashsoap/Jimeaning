import type { ContentType } from "./ContentRenderer";

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentEpisode {
  id: string;
  episodeNumber: number;
  title: string | null;
  status: string;
  reviewScore: number | null;
  script: string | null;
  reviewData: unknown;
  storyboard: string | null;
  imagePrompts: string | null;
  outline: string | null;
  rewriteAttempt?: number;
  reflectionData?: unknown;
  chapterNotes?: string | null;
  similarityScore?: number | null;
}

export interface AgentProject {
  id: string;
  title: string;
  status: string;
  targetEpisodes: number | null;
  durationPerEp: string | null;
  autoMode: boolean;
  outputFormat: string | null;
  analysisData: unknown;
  planningData: unknown;
  styleData: unknown;
  rewriteStrategy: unknown;
  strategyConfirmed: boolean;
  rewriteIntensity?: number;
  preserveDimensions?: string[];
  createdAt: string;
  updatedAt: string;
  episodes: AgentEpisode[];
}

// ─── Status helpers ──────────────────────────────────────────────────

export type StatusVariant = "default" | "accent" | "success" | "danger" | "warning" | "info";

export function statusVariant(status: string): StatusVariant {
  switch (status) {
    case "completed": return "success";
    case "failed": case "review-failed": return "danger";
    case "analyzing": case "planning": case "writing":
    case "reviewing": case "storyboarding": case "imaging":
      return "accent";
    case "analyzed": case "planned": case "drafted":
    case "reviewed": case "storyboarded":
      return "info";
    case "strategy-designed": return "warning";
    case "strategy-confirmed": return "info";
    default: return "default";
  }
}

// ─── Callback types ──────────────────────────────────────────────────

export interface ViewContentPayload {
  title: string;
  content: string;
  type: ContentType;
}
