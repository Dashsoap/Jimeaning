/**
 * Text similarity detection — trigram Jaccard + longest common substring.
 * Zero dependencies, optimized for CJK text.
 */

export interface SimilarityResult {
  trigramSimilarity: number;
  longestCommonRatio: number;
  overallSimilarity: number;
  duplicateSegments: string[];
}

/** Extract character-level trigrams from text */
function extractTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const cleaned = text.replace(/\s+/g, "");
  for (let i = 0; i <= cleaned.length - 3; i++) {
    trigrams.add(cleaned.slice(i, i + 3));
  }
  return trigrams;
}

/** Jaccard similarity between two trigram sets */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = extractTrigrams(a);
  const setB = extractTrigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find longest common substring ratio.
 * Uses sliding window approach for efficiency on large texts.
 * Returns ratio = longest common length / min(a.length, b.length).
 */
export function longestCommonSubstringRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const cleanA = a.replace(/\s+/g, "");
  const cleanB = b.replace(/\s+/g, "");
  if (cleanA.length === 0 || cleanB.length === 0) return 0;

  // For very long texts, sample sections to keep O(n) manageable
  const maxLen = 50000;
  const sA = cleanA.length > maxLen ? cleanA.slice(0, maxLen) : cleanA;
  const sB = cleanB.length > maxLen ? cleanB.slice(0, maxLen) : cleanB;

  // Binary search for longest common substring using rolling hash
  let longest = 0;
  const shorter = sA.length < sB.length ? sA : sB;
  const longer = sA.length < sB.length ? sB : sA;

  // Sliding window: check for common substrings of various lengths
  // Start with a reasonable window and find matches
  const windowSizes = [50, 30, 20, 15, 10];

  for (const windowSize of windowSizes) {
    if (windowSize > shorter.length) continue;

    const shortSubstrings = new Set<string>();
    for (let i = 0; i <= shorter.length - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
      shortSubstrings.add(shorter.slice(i, i + windowSize));
    }

    for (let i = 0; i <= longer.length - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
      const sub = longer.slice(i, i + windowSize);
      if (shortSubstrings.has(sub)) {
        longest = Math.max(longest, windowSize);
        break;
      }
    }

    if (longest >= windowSize) break;
  }

  const minLen = Math.min(sA.length, sB.length);
  return minLen === 0 ? 0 : longest / minLen;
}

/** Find duplicate segments (substrings appearing in both texts, >= minLen chars) */
export function findDuplicateSegments(
  original: string,
  rewritten: string,
  minLen = 20,
): string[] {
  const cleanOrig = original.replace(/\s+/g, "");
  const cleanRewrite = rewritten.replace(/\s+/g, "");
  const segments: string[] = [];
  const seen = new Set<string>();

  // Scan with sliding window
  for (let i = 0; i <= cleanRewrite.length - minLen; i++) {
    const segment = cleanRewrite.slice(i, i + minLen);
    if (!seen.has(segment) && cleanOrig.includes(segment)) {
      // Try to extend the match
      let endIdx = i + minLen;
      while (
        endIdx < cleanRewrite.length &&
        cleanOrig.includes(cleanRewrite.slice(i, endIdx + 1))
      ) {
        endIdx++;
      }
      const fullSegment = cleanRewrite.slice(i, endIdx);
      if (!seen.has(fullSegment)) {
        segments.push(fullSegment);
        seen.add(fullSegment);
      }
      i = endIdx - 1; // Skip past this match
    }
  }

  return segments;
}

/** Combined similarity check */
export function checkSimilarity(
  original: string,
  rewritten: string,
): SimilarityResult {
  const tSim = trigramSimilarity(original, rewritten);
  const lcsRatio = longestCommonSubstringRatio(original, rewritten);
  const duplicateSegments = findDuplicateSegments(original, rewritten);
  const overallSimilarity = Math.max(tSim, lcsRatio);

  return {
    trigramSimilarity: Math.round(tSim * 10000) / 10000,
    longestCommonRatio: Math.round(lcsRatio * 10000) / 10000,
    overallSimilarity: Math.round(overallSimilarity * 10000) / 10000,
    duplicateSegments,
  };
}
