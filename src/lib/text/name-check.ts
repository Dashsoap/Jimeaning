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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
