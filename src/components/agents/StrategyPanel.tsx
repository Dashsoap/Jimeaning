"use client";

import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { AgentProject, ViewContentPayload } from "./types";

interface StrategyData {
  globalStyle?: {
    narrativeVoice: string;
    toneAndRegister: string;
    sentenceRhythm: string;
    dialogueApproach: string;
    tabooPatterns: string[];
  };
  characterVoices?: Record<string, {
    speechStyle: string;
    innerWorld: string;
    uniqueMarkers: string;
  }>;
  chapterPlans?: Array<{
    episodeNumber: number;
    focusPoints: string[];
    emotionalArc: string;
  }>;
  coherenceRules?: {
    recurringMotifs: string[];
    timelineConsistency: string;
    characterArcProgression: string;
    foreshadowingNotes: string[];
  };
  humanReadableSummary?: string;
}

interface StrategyPanelProps {
  project: AgentProject;
  onViewContent: (v: ViewContentPayload) => void;
  t: (key: string) => string;
}

export function StrategyPanel({ project, onViewContent, t }: StrategyPanelProps) {
  const strategy = project.rewriteStrategy as StrategyData | null;
  if (!strategy) return null;

  return (
    <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} className="text-[var(--color-accent)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {t("strategyTitle")}
        </span>
        {project.strategyConfirmed && (
          <Badge variant="success">{t("strategyConfirmed")}</Badge>
        )}
        <button
          onClick={() => onViewContent({
            title: t("strategyTitle"),
            content: JSON.stringify(strategy, null, 2),
            type: "strategy",
          })}
          className="ml-auto text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          {t("viewStrategy")}
        </button>
      </div>

      {/* Summary */}
      {strategy.humanReadableSummary && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-3 leading-relaxed">
          {strategy.humanReadableSummary}
        </p>
      )}

      {/* Global style */}
      {strategy.globalStyle && (
        <div className="mb-3 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">
            {t("strategyStyle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default">{t("narrativeVoice")}: {strategy.globalStyle.narrativeVoice}</Badge>
            <Badge variant="default">{t("toneAndRegister")}: {strategy.globalStyle.toneAndRegister}</Badge>
            <Badge variant="default">{t("sentenceRhythm")}: {strategy.globalStyle.sentenceRhythm}</Badge>
          </div>
          {strategy.globalStyle.tabooPatterns?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {strategy.globalStyle.tabooPatterns.slice(0, 5).map((p, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">
                  {p}
                </span>
              ))}
              {strategy.globalStyle.tabooPatterns.length > 5 && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  +{strategy.globalStyle.tabooPatterns.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Character voices */}
      {strategy.characterVoices && Object.keys(strategy.characterVoices).length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase mb-1">
            {t("strategyCharacters")}
          </p>
          <div className="grid gap-1.5">
            {Object.entries(strategy.characterVoices).slice(0, 4).map(([name, voice]) => (
              <div key={name} className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-surface)] rounded-[var(--radius-sm)] px-2 py-1.5">
                <span className="font-medium">{name}</span>: {voice.speechStyle}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
