/**
 * Name residue detection — scan rewritten text for original names that should have been replaced.
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
      // Count occurrences of the original name
      const regex = new RegExp(escapeRegex(originalName), "g");
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        residues.push({ original: originalName, category, count: matches.length });
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

/**
 * Force-replace all original names with new names in text.
 * Replaces longer names first to avoid partial replacement issues.
 */
export function forceReplaceNames(
  text: string,
  nameMapping: NameMapping,
): { text: string; replacementCount: number } {
  let result = text;
  let replacementCount = 0;

  const allMappings: Array<[string, string]> = [];
  for (const mapping of [nameMapping.characters, nameMapping.locations, nameMapping.organizations]) {
    if (!mapping) continue;
    for (const [orig, replacement] of Object.entries(mapping)) {
      if (orig && replacement && orig !== replacement) {
        allMappings.push([orig, replacement]);
      }
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
