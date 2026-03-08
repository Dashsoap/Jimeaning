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
 * 2. Other models (Grok, etc.) → POST /v1/images/generations
 *    (used by NewAPI/OneAPI proxies for video models)
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

    // All other models use /v1/images/generations (proxy-compatible)
    return this.generateViaImagesApi(model, params);
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
   * Generic: POST /v1/images/generations
   * Used by NewAPI/OneAPI proxies for Grok video, etc.
   */
  private async generateViaImagesApi(
    model: string,
    params: VideoGenerateParams,
  ): Promise<GenerateResult> {
    const prompt = params.prompt || "Animate this image with subtle, natural motion";

    const body: Record<string, unknown> = {
      model,
      prompt: params.imageUrl
        ? `${prompt}\n\nReference image: ${params.imageUrl}`
        : prompt,
      n: 1,
      response_format: "url",
    };

    // Some proxies support image_url as a separate field
    if (params.imageUrl) {
      body.image_url = params.imageUrl;
    }

    const response = await fetch(`${this.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Video generation failed (${response.status}): ${error}`);
    }

    const data = await response.json();

    // Standard OpenAI images response: { data: [{ url, b64_json }] }
    const result = data.data?.[0];
    if (!result) {
      throw new Error("Video generation returned no result");
    }

    return {
      url: result.url,
      base64: result.b64_json,
    };
  }
}
