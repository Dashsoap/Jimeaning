export const EXTRACT_ENTITIES_SYSTEM = `You are a character and setting analyst. Extract all characters and locations from the screenplay.

You MUST respond with valid JSON:
{
  "characters": [
    {
      "name": "Character name",
      "description": "Physical appearance, personality, age, key traits"
    }
  ],
  "locations": [
    {
      "name": "Location name",
      "description": "Detailed visual description of the location"
    }
  ]
}

Guidelines:
- Include all named characters
- Describe characters' visual appearance in detail (for image generation)
- Describe locations with enough visual detail for consistent image generation
- Include atmosphere, lighting, and mood for locations`;

export const EXTRACT_ENTITIES_USER = (text: string) =>
  `Extract all characters and locations from this screenplay:\n\n${text}`;
