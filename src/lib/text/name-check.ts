/**
 * Name residue detection + force replacement.
 * Handles Chinese name variants (姓+称呼: 唐总, 小唐, 唐先生, etc.)
 */

export interface NameMapping {
  characters?: Record<string, string>;
  locations?: Record<string, string>;
  organizations?: Record<string, string>;
}

export interface NameResidueResult {
  residues: Array<{ original: string; category: "character" | "location" | "organization"; count: number }>;
  totalResidues: number;
  passed: boolean;
}

// ─── Chinese surname extraction ──────────────────────────────────────

// Common Chinese compound surnames (must check before single-char)
const COMPOUND_SURNAMES = [
  "欧阳", "司马", "上官", "诸葛", "皇甫", "令狐", "慕容", "尉迟",
  "长孙", "宇文", "东方", "西门", "南宫", "百里", "公孙", "端木",
];

/** Extract surname from a Chinese name. Returns null for non-Chinese names. */
function extractSurname(name: string): string | null {
  if (!name || name.length < 2) return null;
  // Check if it looks like a Chinese name (has CJK chars)
  if (!/[\u4e00-\u9fff]/.test(name)) return null;
  for (const cs of COMPOUND_SURNAMES) {
    if (name.startsWith(cs) && name.length > cs.length) return cs;
  }
  // Single-char surname (most common)
  if (name.length >= 2) return name[0];
  return null;
}

// Common Chinese name suffixes/prefixes that combine with surname
const SURNAME_SUFFIXES = [
  "总", "哥", "姐", "叔", "婶", "伯", "姨", "爷", "奶",
  "先生", "女士", "小姐", "太太", "夫人", "老师", "教授", "医生",
  "博士", "主任", "经理", "董事", "局长", "处长", "科长", "部长",
  "队长", "校长", "院长", "厂长", "老板", "师傅", "师兄", "师姐",
  "师弟", "师妹", "大哥", "大姐", "大嫂",
];
const SURNAME_PREFIXES = ["小", "老", "大", "阿"];

/**
 * Build surname-based variant mappings from a character name mapping.
 * E.g., "唐易"→"周难" generates "唐总"→"周总", "小唐"→"小周", etc.
 * Only generates variants that actually appear in the text.
 */
function buildSurnameVariants(
  charMapping: Record<string, string>,
  text: string,
): Array<[string, string]> {
  // Group by original surname → new surname
  const surnameMap = new Map<string, string>();
  for (const [orig, replacement] of Object.entries(charMapping)) {
    const origSurname = extractSurname(orig);
    const newSurname = extractSurname(replacement);
    if (origSurname && newSurname && origSurname !== newSurname) {
      surnameMap.set(origSurname, newSurname);
    }
  }

  const variants: Array<[string, string]> = [];
  for (const [origSurname, newSurname] of surnameMap) {
    // Suffix variants: 唐总 → 周总
    for (const suffix of SURNAME_SUFFIXES) {
      const origVariant = origSurname + suffix;
      if (text.includes(origVariant)) {
        const newVariant = newSurname + suffix;
        variants.push([origVariant, newVariant]);
      }
    }
    // Prefix variants: 小唐 → 小周
    for (const prefix of SURNAME_PREFIXES) {
      const origVariant = prefix + origSurname;
      if (text.includes(origVariant)) {
        const newVariant = prefix + newSurname;
        variants.push([origVariant, newVariant]);
      }
    }
  }

  return variants;
}

// ─── Detection ───────────────────────────────────────────────────────

/** Find original names that still appear in the rewritten text */
export function findOriginalNameResidues(
  text: string,
  nameMapping: NameMapping,
): NameResidueResult {
  const residues: NameResidueResult["residues"] = [];

  const checkCategory = (
    mapping: Record<string, string> | undefined,
    category: "character" | "location" | "organization",
  ) => {
    if (!mapping) return;
    for (const originalName of Object.keys(mapping)) {
      if (!originalName) continue;
      const regex = new RegExp(escapeRegex(originalName), "g");
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        residues.push({ original: originalName, category, count: matches.length });
      }
    }

    // Also check surname variants for characters
    if (category === "character") {
      const variants = buildSurnameVariants(mapping, text);
      for (const [origVariant] of variants) {
        // Skip if already in explicit mapping
        if (mapping[origVariant]) continue;
        const regex = new RegExp(escapeRegex(origVariant), "g");
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          residues.push({ original: origVariant, category, count: matches.length });
        }
      }
    }
  };

  checkCategory(nameMapping.characters, "character");
  checkCategory(nameMapping.locations, "location");
  checkCategory(nameMapping.organizations, "organization");

  const totalResidues = residues.reduce((sum, r) => sum + r.count, 0);

  return {
    residues,
    totalResidues,
    passed: totalResidues === 0,
  };
}

// ─── Force replacement ───────────────────────────────────────────────

/**
 * Force-replace all original names with new names in text.
 * Includes surname variant replacement (唐总→周总, 小唐→小周, etc.)
 * Replaces longer names first to avoid partial replacement issues.
 */
export function forceReplaceNames(
  text: string,
  nameMapping: NameMapping,
): { text: string; replacementCount: number } {
  let result = text;
  let replacementCount = 0;

  const allMappings: Array<[string, string]> = [];

  // Explicit mappings
  for (const mapping of [nameMapping.characters, nameMapping.locations, nameMapping.organizations]) {
    if (!mapping) continue;
    for (const [orig, replacement] of Object.entries(mapping)) {
      if (orig && replacement && orig !== replacement) {
        allMappings.push([orig, replacement]);
      }
    }
  }

  // Auto-generate surname variants for characters (only for variants found in text)
  if (nameMapping.characters) {
    const variants = buildSurnameVariants(nameMapping.characters, result);
    for (const [origVariant, newVariant] of variants) {
      // Skip if already in explicit mapping
      if (nameMapping.characters[origVariant]) continue;
      allMappings.push([origVariant, newVariant]);
    }
  }

  // Sort by length descending — replace longer names first to avoid partial matches
  allMappings.sort((a, b) => b[0].length - a[0].length);

  for (const [orig, replacement] of allMappings) {
    const regex = new RegExp(escapeRegex(orig), "g");
    const matches = result.match(regex);
    if (matches) {
      replacementCount += matches.length;
      result = result.replace(regex, replacement);
    }
  }

  return { text: result, replacementCount };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
