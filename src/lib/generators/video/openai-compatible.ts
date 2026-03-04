import type {
  VideoGenerator,
  VideoGenerateParams,
  GenerateResult,
  ProviderConfig,
} from "../types";

export class OpenAIVideoGenerator implements VideoGenerator {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.openai.com";
    this.defaultModel = config.model || "sora";
  }

  async generate(params: VideoGenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;

    // Use the responses API via fetch to avoid SDK type issues
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

    // Extract video output
    const videoOutput = data.output?.find(
      (o: { type: string }) => o.type === "video_generation_call"
    );

    return {
      externalId: videoOutput?.id,
    };
  }
}
