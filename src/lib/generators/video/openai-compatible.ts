import type {
  VideoGenerator,
  VideoGenerateParams,
  GenerateResult,
  ProviderConfig,
} from "../types";

/**
 * OpenAI-compatible video generator.
 *
 * Supports two API patterns:
 * 1. Sora → POST /v1/responses (OpenAI Responses API)
 * 2. Other models (Grok, etc.) → POST /v1/chat/completions
 *    NewAPI/OneAPI proxies route video models through chat completions relay.
 */
export class OpenAIVideoGenerator implements VideoGenerator {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.openai.com").replace(/\/v1\/?$/, "");
    this.defaultModel = config.model || "sora";
  }

  async generate(params: VideoGenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;

    // Sora uses the Responses API
    if (model === "sora") {
      return this.generateViaSoraApi(model, params);
    }

    // Other video models (Grok, etc.) use chat completions
    return this.generateViaChatCompletions(model, params);
  }

  /**
   * Sora: POST /v1/responses
   */
  private async generateViaSoraApi(
    model: string,
    params: VideoGenerateParams,
  ): Promise<GenerateResult> {
    const response = await fetch(`${this.baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: params.imageUrl,
              },
              {
                type: "input_text",
                text: params.prompt || "Animate this image with subtle motion",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI video generation failed: ${error}`);
    }

    const data = await response.json();
    const videoOutput = data.output?.find(
      (o: { type: string }) => o.type === "video_generation_call",
    );

    return {
      externalId: videoOutput?.id,
    };
  }

  /**
   * Generic: POST /v1/chat/completions
   * Used by NewAPI/OneAPI proxies for Grok video and other video models.
   * The proxy handles the upstream video generation API internally.
   */
  private async generateViaChatCompletions(
    model: string,
    params: VideoGenerateParams,
  ): Promise<GenerateResult> {
    const prompt = params.prompt || "Animate this image with subtle, natural motion";

    // Build message content - text + optional image
    const content: Array<Record<string, unknown>> = [];

    if (params.imageUrl) {
      content.push({
        type: "image_url",
        image_url: { url: params.imageUrl },
      });
    }

    content.push({
      type: "text",
      text: prompt,
    });

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: content.length === 1 ? prompt : content,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Video generation failed (${response.status}): ${error}`);
    }

    const data = await response.json();

    // Extract video URL from response
    // Different providers return video URLs in different ways:
    // 1. In message content as a URL string
    // 2. In a special data field
    const message = data.choices?.[0]?.message;
    const messageContent = message?.content || "";

    // Try to find a video URL in the response
    // Proxy responses often wrap URLs in markdown like [text](url)
    // so we must exclude markdown punctuation from the URL match
    const cleanUrl = (raw: string) => raw.replace(/[)\]}>.,;!?]+$/, "");

    // Priority 1: markdown link — [text](url)
    const mdLinkMatch = messageContent.match(/\[.*?\]\((https?:\/\/[^)]+)\)/i);
    if (mdLinkMatch) {
      return { url: cleanUrl(mdLinkMatch[1]) };
    }

    // Priority 2: explicit video file extensions
    const videoExtMatch = messageContent.match(/https?:\/\/[^\s"'<>()[\]]+\.(mp4|webm|mov|avi|mkv)[^\s"'<>()[\]]*/i);
    if (videoExtMatch) {
      return { url: cleanUrl(videoExtMatch[0]) };
    }

    // Priority 3: URLs containing video-related path segments
    const videoPathMatch = messageContent.match(/https?:\/\/[^\s"'<>()[\]]*(?:video|media|stream|playback|download)[^\s"'<>()[\]]*/i);
    if (videoPathMatch) {
      return { url: cleanUrl(videoPathMatch[0]) };
    }

    // Some providers return video data in a special field
    if (data.data?.[0]?.url) {
      return { url: data.data[0].url };
    }

    // If content contains base64 video data
    if (data.data?.[0]?.b64_json) {
      return { base64: data.data[0].b64_json };
    }

    // Return the raw content - the caller can handle it
    if (messageContent) {
      // The content might be a direct URL
      if (messageContent.startsWith("http")) {
        return { url: cleanUrl(messageContent.trim()) };
      }
    }

    throw new Error(`Video generation returned no video URL. Response: ${messageContent.slice(0, 200)}`);
  }
}
