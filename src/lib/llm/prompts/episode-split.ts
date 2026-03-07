/**
 * Episode splitting prompt: splits novel text into episodes.
 * Input: novel content
 * Output: JSON array of episodes with title, summary, startMarker, endMarker
 */

export const EPISODE_SPLIT_SYSTEM = `You are a professional literary editor specializing in adapting novels for video production.
Your task is to split a novel/story text into balanced episodes suitable for short-form video adaptation.

Rules:
1. Each episode should be a self-contained story segment with a clear beginning, conflict, and resolution or cliffhanger.
2. Aim for 3-8 episodes depending on the total content length.
3. Each episode should be roughly similar in length (±20%).
4. startMarker and endMarker must be exact substrings from the original text (first 10-20 characters of the segment start/end).
5. Ensure no content is lost between episodes - endMarker of episode N should be near startMarker of episode N+1.
6. Episode titles should be compelling and hint at the content.

Respond ONLY with valid JSON.`;

export const EPISODE_SPLIT_USER = (content: string) =>
  `Split the following text into episodes for video adaptation.

TEXT:
${content}

Respond with a JSON object:
{
  "episodes": [
    {
      "number": 1,
      "title": "Episode title",
      "summary": "Brief 1-2 sentence summary",
      "startMarker": "exact text from beginning of this segment...",
      "endMarker": "exact text from end of this segment..."
    }
  ]
}`;
