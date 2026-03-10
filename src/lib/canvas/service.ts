/**
 * tldraw canvas service for jimeaning.
 * Adapted from anime-ai-studio canvasService.ts for tldraw v4.
 *
 * 5 stages laid out horizontally: Script → Assets → Storyboard → Voice → Compose
 */

import type { Editor, TLShapeId } from "@tldraw/editor";
import { toRichText } from "@tldraw/tlschema";
import type { CanvasStage, StageAreaConfig } from "./types";

// ─── Stage Layout ────────────────────────────────────────────────────────────

export const STAGE_AREAS: Record<CanvasStage, StageAreaConfig> = {
  script: {
    stage: "script",
    label: "Script",
    x: 0,
    y: 0,
    width: 2000,
    color: "#6366f1",
  },
  assets: {
    stage: "assets",
    label: "Assets",
    x: 2200,
    y: 0,
    width: 2000,
    color: "#8b5cf6",
  },
  storyboard: {
    stage: "storyboard",
    label: "Storyboard",
    x: 4400,
    y: 0,
    width: 3000,
    color: "#ec4899",
  },
  voice: {
    stage: "voice",
    label: "Voice",
    x: 7600,
    y: 0,
    width: 2000,
    color: "#f97316",
  },
  compose: {
    stage: "compose",
    label: "Compose",
    x: 9800,
    y: 0,
    width: 2000,
    color: "#22c55e",
  },
};

const DEFAULT_BG_HEIGHT = 1200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type GeoColor =
  | "black"
  | "grey"
  | "light-violet"
  | "light-blue"
  | "light-green"
  | "light-red"
  | "violet"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red";

function createText(
  editor: Editor,
  x: number,
  y: number,
  text: string,
  size: "s" | "m" | "l" = "m",
  color: "black" | "grey" = "black",
) {
  editor.createShape({
    type: "text",
    x,
    y,
    isLocked: true,
    props: { richText: toRichText(text), size, font: "sans", color },
  });
}

function createGeoCard(
  editor: Editor,
  x: number,
  y: number,
  w: number,
  h: number,
  color: GeoColor = "light-blue",
  label?: string,
) {
  const props: Record<string, unknown> = {
    geo: "rectangle",
    w,
    h,
    color,
    fill: "semi",
    dash: "solid",
    size: "s",
  };
  if (label) {
    props.richText = toRichText(label);
    props.font = "sans";
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.createShape({ type: "geo", x, y, isLocked: true, props } as any);
}

function createImage(
  editor: Editor,
  x: number,
  y: number,
  w: number,
  h: number,
  url: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.createShape({ type: "image", x, y, isLocked: true, props: { w, h, url } } as any);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

const stageBackgroundIds: Partial<Record<CanvasStage, TLShapeId>> = {};

export function navigateToStage(editor: Editor, stage: CanvasStage): void {
  const area = STAGE_AREAS[stage];
  if (!area) return;

  const centerX = area.x + area.width / 2;
  const centerY = area.y + 500;

  editor.setCamera(
    {
      x: -centerX + editor.getViewportScreenBounds().width / 2,
      y: -centerY + editor.getViewportScreenBounds().height / 2,
    },
    { animation: { duration: 300 } },
  );
}

export function getCurrentStageFromView(editor: Editor): CanvasStage {
  const camera = editor.getCamera();
  const viewCenterX = -camera.x + editor.getViewportScreenBounds().width / 2;

  for (const [stage, area] of Object.entries(STAGE_AREAS)) {
    if (viewCenterX >= area.x && viewCenterX < area.x + area.width + 200) {
      return stage as CanvasStage;
    }
  }
  return "script";
}

// ─── Background ──────────────────────────────────────────────────────────────

export function addStageBackgrounds(editor: Editor): void {
  for (const config of Object.values(STAGE_AREAS)) {
    const before = editor.getCurrentPageShapeIds();

    createGeoCard(
      editor,
      config.x,
      config.y - 50,
      config.width,
      DEFAULT_BG_HEIGHT,
      "light-blue",
    );
    // Override dash to dashed for backgrounds
    const after = editor.getCurrentPageShapeIds();
    for (const id of after) {
      if (!before.has(id)) {
        stageBackgroundIds[config.stage] = id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateShape({ id, type: "geo", isLocked: true, props: { dash: "dashed" } } as any);
        break;
      }
    }

    createText(editor, config.x + 20, config.y - 30, config.label, "l");
  }
}

// ─── Clear ───────────────────────────────────────────────────────────────────

export function clearStageData(editor: Editor, stage: CanvasStage): void {
  const area = STAGE_AREAS[stage];
  const allShapes = editor.getCurrentPageShapes();

  const dataShapes = allShapes.filter((shape) => {
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) return false;
    if (bounds.x < area.x || bounds.x >= area.x + area.width + 2000)
      return false;
    if (shape.type === "geo" && bounds.w > 1500) return false;
    if (shape.type === "text" && bounds.y < area.y + 20) return false;
    return true;
  });

  if (dataShapes.length > 0) {
    editor.deleteShapes(dataShapes.map((s) => s.id));
  }
}

// ─── Data Types ──────────────────────────────────────────────────────────────

export interface CanvasProjectData {
  project: {
    name: string;
    sourceText?: string | null;
    style?: string | null;
  };
  characters: Array<{
    id: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
  }>;
  locations: Array<{
    id: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
  }>;
  episodes: Array<{
    id: string;
    title?: string | null;
    sortOrder: number;
    clips: Array<{
      id: string;
      dialogue?: string | null;
      sortOrder: number;
      panels: Array<{
        id: string;
        sceneDescription?: string | null;
        imageUrl?: string | null;
        videoUrl?: string | null;
        shotType?: string | null;
        cameraAngle?: string | null;
        durationMs: number;
        sortOrder: number;
        characterIds?: string | null;
        locationId?: string | null;
        voiceLines: Array<{
          id: string;
          text?: string | null;
          audioUrl?: string | null;
        }>;
      }>;
    }>;
  }>;
}

// ─── Stage Renderers ─────────────────────────────────────────────────────────

function renderScriptData(editor: Editor, data: CanvasProjectData): void {
  clearStageData(editor, "script");
  const area = STAGE_AREAS.script;
  let y = area.y + 80;

  createText(editor, area.x + 20, y, data.project.name, "l");
  y += 50;

  if (data.project.style) {
    createText(editor, area.x + 20, y, `Style: ${data.project.style}`, "s", "grey");
    y += 30;
  }

  if (data.project.sourceText) {
    const preview =
      data.project.sourceText.substring(0, 500) +
      (data.project.sourceText.length > 500 ? "..." : "");
    createGeoCard(editor, area.x + 20, y, 1200, 300, "light-violet", preview);
    y += 320;
  }

  if (data.episodes.length > 0) {
    createText(editor, area.x + 20, y, "Episodes", "m");
    y += 35;

    for (const ep of data.episodes) {
      const clipCount = ep.clips.length;
      const panelCount = ep.clips.reduce((s, c) => s + c.panels.length, 0);
      createGeoCard(
        editor,
        area.x + 40,
        y,
        500,
        60,
        "light-blue",
        `Ep ${ep.sortOrder + 1}: ${ep.title || "Untitled"}\n${clipCount} clips, ${panelCount} panels`,
      );
      y += 70;
    }
  }
}

function renderAssetsData(editor: Editor, data: CanvasProjectData): void {
  clearStageData(editor, "assets");
  const area = STAGE_AREAS.assets;
  let y = area.y + 80;
  const cardW = 250;
  const cardH = 300;
  const gap = 20;
  const cols = 4;

  if (data.characters.length > 0) {
    createText(editor, area.x + 20, y, "Characters", "m");
    y += 40;

    for (let i = 0; i < data.characters.length; i++) {
      const char = data.characters[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = area.x + 40 + col * (cardW + gap);
      const cy = y + row * (cardH + gap);

      createGeoCard(editor, cx, cy, cardW, cardH, "light-violet");

      if (char.imageUrl && !char.imageUrl.startsWith("data:")) {
        createImage(editor, cx + 10, cy + 10, cardW - 20, cardW - 20, char.imageUrl);
      }

      createText(editor, cx + 10, cy + cardW, char.name, "s");
    }

    const charRows = Math.ceil(data.characters.length / cols);
    y += charRows * (cardH + gap) + 20;
  }

  if (data.locations.length > 0) {
    createText(editor, area.x + 20, y, "Locations", "m");
    y += 40;

    for (let i = 0; i < data.locations.length; i++) {
      const loc = data.locations[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = area.x + 40 + col * (cardW + gap);
      const cy = y + row * (cardH + gap);

      createGeoCard(editor, cx, cy, cardW, cardH, "light-green");

      if (loc.imageUrl && !loc.imageUrl.startsWith("data:")) {
        createImage(editor, cx + 10, cy + 10, cardW - 20, cardW - 20, loc.imageUrl);
      }

      createText(editor, cx + 10, cy + cardW, loc.name, "s");
    }
  }
}

function renderStoryboardData(editor: Editor, data: CanvasProjectData): void {
  clearStageData(editor, "storyboard");
  const area = STAGE_AREAS.storyboard;
  let y = area.y + 80;
  const panelW = 180;
  const panelH = 400;
  const gap = 15;
  const cols = 8;

  for (const ep of data.episodes) {
    createText(
      editor,
      area.x + 20,
      y,
      `Episode ${ep.sortOrder + 1}: ${ep.title || ""}`,
      "m",
    );
    y += 35;

    const allPanels = ep.clips.flatMap((c) =>
      c.panels.map((p) => ({ ...p, clipDialogue: c.dialogue })),
    );

    for (let i = 0; i < allPanels.length; i++) {
      const panel = allPanels[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const px = area.x + 40 + col * (panelW + gap);
      const py = y + row * (panelH + gap);

      const panelColor = panel.videoUrl
        ? "light-green"
        : panel.imageUrl
          ? "light-blue"
          : "light-red";

      createGeoCard(editor, px, py, panelW, panelH, panelColor);

      if (panel.imageUrl && !panel.imageUrl.startsWith("data:")) {
        createImage(
          editor,
          px + 5,
          py + 5,
          panelW - 10,
          (panelW - 10) * (16 / 9),
          panel.imageUrl,
        );
      }

      // Character/location names
      const charNames = panel.characterIds
        ? (() => {
            try {
              const ids: string[] = JSON.parse(panel.characterIds);
              return ids
                .map((id) => data.characters.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(", ");
            } catch {
              return "";
            }
          })()
        : "";
      const locName = panel.locationId
        ? data.locations.find((l) => l.id === panel.locationId)?.name || ""
        : "";

      const assetLine = [charNames, locName].filter(Boolean).join(" | ");
      if (assetLine) {
        createText(editor, px + 5, py + panelH - 80, assetLine, "s", "grey");
      }

      const statusIcon = panel.videoUrl ? "V" : panel.imageUrl ? "I" : "-";
      const info = [
        `#${i + 1} [${statusIcon}]`,
        panel.shotType || "",
        `${(panel.durationMs / 1000).toFixed(1)}s`,
      ]
        .filter(Boolean)
        .join(" | ");

      createText(editor, px + 5, py + panelH - 55, info, "s");

      // Voice line preview
      if (panel.voiceLines.length > 0 && panel.voiceLines[0].text) {
        const vlText = panel.voiceLines[0].text.substring(0, 30) +
          (panel.voiceLines[0].text.length > 30 ? "..." : "");
        createText(editor, px + 5, py + panelH - 30, vlText, "s", "grey");
      }

      // Character/location thumbnails
      let thumbX = px + 5;
      const thumbY = py + panelH - 15;
      if (panel.characterIds) {
        try {
          const ids: string[] = JSON.parse(panel.characterIds);
          for (const id of ids.slice(0, 3)) {
            const char = data.characters.find((c) => c.id === id);
            if (char?.imageUrl && !char.imageUrl.startsWith("data:")) {
              createImage(editor, thumbX, thumbY, 30, 30, char.imageUrl);
              thumbX += 35;
            }
          }
        } catch { /* ignore */ }
      }
      if (panel.locationId) {
        const loc = data.locations.find((l) => l.id === panel.locationId);
        if (loc?.imageUrl && !loc.imageUrl.startsWith("data:")) {
          createImage(editor, thumbX, thumbY, 30, 30, loc.imageUrl);
        }
      }
    }

    const rows = Math.ceil(allPanels.length / cols);
    y += rows * (panelH + gap) + 30;
  }
}

function renderVoiceData(editor: Editor, data: CanvasProjectData): void {
  clearStageData(editor, "voice");
  const area = STAGE_AREAS.voice;
  let y = area.y + 80;

  for (const ep of data.episodes) {
    createText(editor, area.x + 20, y, `Episode ${ep.sortOrder + 1}`, "m");
    y += 35;

    for (const clip of ep.clips) {
      for (const panel of clip.panels) {
        if (panel.voiceLines.length === 0) continue;

        for (const vl of panel.voiceLines) {
          const hasAudio = !!vl.audioUrl;
          createGeoCard(
            editor,
            area.x + 40,
            y,
            800,
            50,
            hasAudio ? "light-green" : "light-red",
            `${hasAudio ? "[OK]" : "[--]"} ${vl.text || ""}`,
          );
          y += 60;
        }
      }
    }
    y += 20;
  }
}

function renderComposeData(editor: Editor, data: CanvasProjectData): void {
  clearStageData(editor, "compose");
  const area = STAGE_AREAS.compose;
  let y = area.y + 80;

  createText(editor, area.x + 20, y, "Compose", "m");
  y += 40;

  for (const ep of data.episodes) {
    const panelCount = ep.clips.reduce((s, c) => s + c.panels.length, 0);
    const videoDone = ep.clips.reduce(
      (s, c) => s + c.panels.filter((p) => p.videoUrl).length,
      0,
    );
    const voiceDone = ep.clips.reduce(
      (s, c) =>
        s +
        c.panels.reduce(
          (vs, p) => vs + p.voiceLines.filter((v) => v.audioUrl).length,
          0,
        ),
      0,
    );

    const color =
      videoDone === panelCount && panelCount > 0 ? "light-green" : "light-blue";
    createGeoCard(
      editor,
      area.x + 40,
      y,
      600,
      80,
      color,
      `Episode ${ep.sortOrder + 1}: ${ep.title || ""}\nPanels: ${panelCount} | Videos: ${videoDone} | Voice: ${voiceDone}`,
    );
    y += 100;
  }
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export function renderStageData(
  editor: Editor,
  stage: CanvasStage,
  data: CanvasProjectData,
): void {
  switch (stage) {
    case "script":
      renderScriptData(editor, data);
      break;
    case "assets":
      renderAssetsData(editor, data);
      break;
    case "storyboard":
      renderStoryboardData(editor, data);
      break;
    case "voice":
      renderVoiceData(editor, data);
      break;
    case "compose":
      renderComposeData(editor, data);
      break;
  }
}

export function renderAllStages(
  editor: Editor,
  data: CanvasProjectData,
): void {
  for (const stage of Object.keys(STAGE_AREAS) as CanvasStage[]) {
    renderStageData(editor, stage, data);
  }
}
