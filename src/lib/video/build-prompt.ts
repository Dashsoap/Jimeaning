/**
 * Video prompt builder with reference image descriptions.
 *
 * Adapted from anime-ai-studio directorService.ts
 * Pattern: "图1是{角色名}，图2是{场景}，图3是关键帧。{画面内容}，{景别}，{机位}，{运镜}"
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReferenceImage {
  url: string;
  type: "character" | "location" | "keyframe";
  name: string;
}

// ─── Character Name Parsing (from anime-ai-studio directorService.ts:94-166) ─

const NO_CHARACTER_MARKERS = new Set(["无", "空", "空镜", "空镜无人物"]);

const normalizeName = (name: string): string =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const dedupeByNormalize = (names: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
};

const splitCharacterText = (text: string): string[] => {
  const raw = String(text || "").trim();
  if (!raw || NO_CHARACTER_MARKERS.has(raw)) return [];

  const primary = raw
    .split(/\s*[、,，;；\/|&]+\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (primary.length > 1) return primary;

  const secondary = raw
    .split(/[和与及跟]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (secondary.length > 1) return secondary;

  return primary.length > 0 ? primary : [raw];
};

/**
 * Parse character names from panel.actingNotes JSON.
 * actingNotes is a JSON array of objects with character name fields.
 */
export function parseCharacterNamesFromActingNotes(
  actingNotes: string | null | undefined,
): string[] {
  if (!actingNotes) return [];
  try {
    const parsed = JSON.parse(actingNotes);
    if (!Array.isArray(parsed)) return [];

    const names: string[] = [];
    for (const entry of parsed) {
      // actingNotes entries typically have a "character" or "name" field
      const name =
        typeof entry === "string"
          ? entry
          : entry?.character || entry?.name || "";
      if (name) {
        names.push(...splitCharacterText(String(name)));
      }
    }
    return dedupeByNormalize(
      names.filter((n) => !NO_CHARACTER_MARKERS.has(n)),
    );
  } catch {
    return [];
  }
}

/**
 * Parse character names from panel.sceneDescription text.
 * Matches names against known character list.
 */
export function matchCharacterNamesFromText(
  text: string | null | undefined,
  knownNames: string[],
): string[] {
  if (!text || knownNames.length === 0) return [];
  return knownNames.filter((name) => text.includes(name));
}

// ─── Prompt Builder (from anime-ai-studio directorService.ts:476-515) ────────

/**
 * Build video generation prompt with reference image descriptions.
 *
 * Output format: "图1是{场景}，图2是{角色}，图3是关键帧。{画面内容}，{景别}，{机位}，{运镜}"
 */
export function buildVideoPromptWithReferences(
  referenceImages: ReferenceImage[],
  originalPrompt: string,
  panel: {
    shotType?: string | null;
    cameraAngle?: string | null;
    cameraMove?: string | null;
  },
): string {
  const parts: string[] = [];

  // Reference image descriptions
  if (referenceImages.length > 0) {
    const descs = referenceImages.map(
      (img, i) => `图${i + 1}是${img.name}`,
    );
    parts.push(descs.join("，") + "。");
  }

  // Scene content
  if (originalPrompt) {
    parts.push(originalPrompt);
  }

  // Technical: shot type, camera angle, camera movement
  const tech: string[] = [];
  if (panel.shotType) tech.push(panel.shotType);
  if (panel.cameraAngle) tech.push(panel.cameraAngle);
  if (panel.cameraMove) tech.push(panel.cameraMove);
  if (tech.length > 0) {
    parts.push(tech.join("，"));
  }

  // Merge and cap at 490 chars (API limits)
  let prompt = parts.join("，");
  if (prompt.length > 490) {
    prompt = prompt.substring(0, 490) + "...";
  }

  return prompt;
}

// ─── Reference Image Collection ──────────────────────────────────────────────

const MAX_REFERENCE_IMAGES = 4;

interface CharacterWithImage {
  name: string;
  imageUrl: string | null;
}

interface LocationWithImage {
  name: string;
  imageUrl: string | null;
}

/**
 * Collect reference images for video generation.
 * Order: location → characters → keyframe (panel image last).
 *
 * Adapted from anime-ai-studio directorService.ts:370-470
 */
export function collectReferenceImages(
  panelImageUrl: string,
  characters: CharacterWithImage[],
  locations: LocationWithImage[],
  characterNames: string[],
  sceneDescription: string | null | undefined,
): ReferenceImage[] {
  const refs: ReferenceImage[] = [];

  // 1. Scene/location (match from sceneDescription)
  if (sceneDescription) {
    const matched = locations.find(
      (l) => l.imageUrl && sceneDescription.includes(l.name),
    );
    if (matched?.imageUrl) {
      refs.push({
        url: matched.imageUrl,
        type: "location",
        name: matched.name,
      });
    }
  }

  // 2. Characters (from actingNotes/sceneDescription names)
  for (const name of characterNames) {
    if (refs.length >= MAX_REFERENCE_IMAGES - 1) break; // reserve 1 slot for keyframe
    const char = characters.find(
      (c) => c.imageUrl && normalizeName(c.name) === normalizeName(name),
    );
    if (char?.imageUrl) {
      refs.push({ url: char.imageUrl, type: "character", name: char.name });
    }
  }

  // 3. Keyframe (panel image) always last
  refs.push({ url: panelImageUrl, type: "keyframe", name: "关键帧" });

  return refs;
}
