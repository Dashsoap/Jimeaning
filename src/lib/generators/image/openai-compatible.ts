import OpenAI from "openai";
import type {
  ImageGenerator,
  ImageGenerateParams,
  GenerateResult,
  ProviderConfig,
} from "../types";
import { withRetry } from "@/lib/retry";

export class OpenAIImageGenerator implements ImageGenerator {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.defaultModel = config.model || "gpt-image-1";
  }

  async generate(params: ImageGenerateParams): Promise<GenerateResult> {
    const model = params.model || this.defaultModel;

    return withRetry(async () => {
      const response = await this.client.images.generate({
        model,
        prompt: params.prompt,
        n: 1,
        size: this.getSize(params.width, params.height),
      });

      const data = response.data?.[0];
      return {
        url: data?.url ?? undefined,
        base64: data?.b64_json ?? undefined,
      };
    }, { label: `image:${model}` });
  }

  private getSize(
    w?: number,
    h?: number
  ): "1024x1024" | "1792x1024" | "1024x1792" {
    if (w && h) {
      if (w > h) return "1792x1024";
      if (h > w) return "1024x1792";
    }
    return "1024x1024";
  }
}
