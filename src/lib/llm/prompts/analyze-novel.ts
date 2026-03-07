/**
 * Novel analysis prompt: extracts characters and locations from text.
 * Input: novel/episode content
 * Output: JSON with characters and locations arrays
 */

export const ANALYZE_NOVEL_SYSTEM = `You are a literary analyst specializing in character and setting extraction for video adaptation.
Analyze the provided text and extract all significant characters and locations.

Rules for characters:
1. Include all named characters and important unnamed ones (e.g., "the old man").
2. Provide a brief physical/personality description based on text evidence.
3. Classify role: "main", "supporting", or "minor".
4. Note any aliases or nicknames.

Rules for locations:
1. Include all significant settings where scenes take place.
2. Provide a visual description suitable for image generation.
3. Note the mood/atmosphere of each location.

Respond ONLY with valid JSON.`;

export const ANALYZE_NOVEL_USER = (content: string, existingCharacters?: string, existingLocations?: string) =>
  `Analyze the following text and extract characters and locations.

${existingCharacters ? `EXISTING CHARACTERS (skip these):\n${existingCharacters}\n` : ""}
${existingLocations ? `EXISTING LOCATIONS (skip these):\n${existingLocations}\n` : ""}

TEXT:
${content}

Respond with a JSON object:
{
  "characters": [
    {
      "name": "Character Name",
      "aliases": ["Nickname"],
      "description": "Physical and personality description",
      "role": "main|supporting|minor",
      "gender": "male|female|unknown"
    }
  ],
  "locations": [
    {
      "name": "Location Name",
      "description": "Visual description of the setting",
      "mood": "atmospheric mood description"
    }
  ]
}`;
