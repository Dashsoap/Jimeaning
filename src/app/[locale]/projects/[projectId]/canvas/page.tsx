"use client";

/**
 * Canvas page — tldraw infinite canvas view for project workflow.
 * Adapted from anime-ai-studio CanvasPanel.tsx + MainLayout.tsx stage nav.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { Tldraw } from "tldraw";
import { useEditor } from "@tldraw/editor";
import type { Editor } from "@tldraw/editor";
import "tldraw/tldraw.css";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasStage } from "@/lib/canvas/types";
import {
  STAGE_AREAS,
  navigateToStage,
  addStageBackgrounds,
  renderAllStages,
} from "@/lib/canvas/service";
import type { CanvasProjectData } from "@/lib/canvas/service";

// ─── Stage definitions for nav bar ──────────────────────────────────────────

const STAGES: Array<{ id: CanvasStage; label: string; icon: string }> = [
  { id: "script", label: "Script", icon: "📝" },
  { id: "assets", label: "Assets", icon: "🎨" },
  { id: "storyboard", label: "Storyboard", icon: "🎬" },
  { id: "voice", label: "Voice", icon: "🎙️" },
  { id: "compose", label: "Compose", icon: "🎥" },
];

// ─── Keyboard shortcuts (undo/redo since hideUi disables them) ──────────────

function KeyboardShortcutsHandler() {
  const editor = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        editor.redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return null;
}

// ─── Stage completion detection ─────────────────────────────────────────────

function isStageCompleted(data: CanvasProjectData, stage: CanvasStage): boolean {
  switch (stage) {
    case "script":
      return !!data.project.sourceText;
    case "assets":
      return data.characters.length > 0 || data.locations.length > 0;
    case "storyboard":
      return data.episodes.some((ep) =>
        ep.clips.some((c) => c.panels.length > 0),
      );
    case "voice":
      return data.episodes.some((ep) =>
        ep.clips.some((c) =>
          c.panels.some((p) => p.voiceLines.some((vl) => vl.audioUrl)),
        ),
      );
    case "compose":
      return data.episodes.some((ep) =>
        ep.clips.some((c) => c.panels.some((p) => p.videoUrl)),
      );
  }
}

// ─── Main Canvas Page ───────────────────────────────────────────────────────

export default function CanvasPage() {
  const t = useTranslations("project");
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";

  const [activeStage, setActiveStage] = useState<CanvasStage>("script");
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastDataHashRef = useRef("");

  // Fetch project data
  const { data: projectData } = useQuery<CanvasProjectData>({
    queryKey: ["canvas-project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}?include=full`);
      const project = await res.json();

      // Transform API response to CanvasProjectData shape
      return {
        project: {
          name: project.title,
          sourceText: project.sourceText,
          style: project.style,
        },
        characters: project.characters || [],
        locations: project.locations || [],
        episodes: (project.episodes || []).map(
          (ep: Record<string, unknown>) => ({
            id: ep.id,
            title: ep.title,
            sortOrder: ep.sortOrder,
            clips: ((ep.clips as Array<Record<string, unknown>>) || []).map(
              (c) => ({
                id: c.id,
                dialogue: c.dialogue,
                sortOrder: c.sortOrder,
                panels: ((c.panels as Array<Record<string, unknown>>) || []).map(
                  (p) => ({
                    id: p.id,
                    sceneDescription: p.sceneDescription,
                    imageUrl: p.imageUrl,
                    videoUrl: p.videoUrl,
                    shotType: p.shotType,
                    cameraAngle: p.cameraAngle,
                    durationMs: (p.durationMs as number) || 3000,
                    sortOrder: p.sortOrder,
                    characterIds: p.characterIds,
                    locationId: p.locationId,
                    voiceLines: (p.voiceLines as Array<Record<string, unknown>>) || [],
                  }),
                ),
              }),
            ),
          }),
        ),
      } satisfies CanvasProjectData;
    },
    refetchInterval: 15000,
  });

  // tldraw mount handler
  const handleMount = useCallback(
    (editor: Editor) => {
      setEditorRef(editor);
      addStageBackgrounds(editor);
      navigateToStage(editor, activeStage);
      setIsInitialized(true);
    },
    [activeStage],
  );

  // Navigate when stage changes
  useEffect(() => {
    if (editorRef && isInitialized) {
      navigateToStage(editorRef, activeStage);
    }
  }, [editorRef, activeStage, isInitialized]);

  // Render data when it changes
  useEffect(() => {
    if (!editorRef || !isInitialized || !projectData) return;

    const hash = JSON.stringify(projectData);
    if (hash === lastDataHashRef.current) return;
    lastDataHashRef.current = hash;

    renderAllStages(editorRef, projectData);
  }, [editorRef, isInitialized, projectData]);

  const handleStageChange = (stage: CanvasStage) => {
    setActiveStage(stage);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar: back + stage nav */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 z-10">
        <button
          onClick={() => router.push(`/${locale}/projects/${projectId}`)}
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          title={t("back")}
        >
          <ArrowLeft size={18} />
        </button>

        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-4">
          {projectData?.project.name || "..."}
        </span>

        {/* Stage Nav (adapted from anime-ai-studio MainLayout.tsx) */}
        <nav className="flex items-center gap-1">
          {STAGES.map((stage, index) => {
            const completed = projectData
              ? isStageCompleted(projectData, stage.id)
              : false;
            const isActive = activeStage === stage.id;

            return (
              <div key={stage.id} className="relative flex items-center">
                <button
                  onClick={() => handleStageChange(stage.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all",
                    isActive && "bg-blue-50 dark:bg-blue-900/30",
                    completed && !isActive && "bg-green-50 dark:bg-green-900/20",
                    !completed && !isActive && "opacity-60",
                  )}
                >
                  {completed && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                  <span>{stage.icon}</span>
                  <span
                    className={cn(
                      "text-xs",
                      isActive && "text-blue-600 dark:text-blue-400 font-medium",
                      completed && !isActive && "text-green-600 dark:text-green-400",
                      !completed && !isActive && "text-gray-500",
                    )}
                  >
                    {stage.label}
                  </span>
                </button>
                {index < STAGES.length - 1 && (
                  <span
                    className={cn(
                      "text-xs mx-0.5",
                      completed ? "text-green-400" : "text-gray-300",
                    )}
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        <button
          onClick={() => router.push(`/${locale}/projects/${projectId}`)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Card View
        </button>
      </div>

      {/* tldraw Canvas */}
      <div className="flex-1 relative">
        <Tldraw onMount={handleMount} hideUi>
          <KeyboardShortcutsHandler />
        </Tldraw>
      </div>
    </div>
  );
}
