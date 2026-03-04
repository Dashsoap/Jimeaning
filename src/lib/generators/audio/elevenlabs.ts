import type {
  AudioGenerator,
  AudioGenerateParams,
  GenerateResult,
  ProviderConfig,
} from "../types";

export class ElevenLabsGenerator implements AudioGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.elevenlabs.io";
  }

  async generate(params: AudioGenerateParams): Promise<GenerateResult> {
    const voiceId = params.voiceId || "21m00Tcm4TlvDq8ikWAM"; // default Rachel
    const model = params.model || "eleven_multilingual_v2";

    const response = await fetch(
      `${this.baseUrl}/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${error}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString("base64"),
    };
  }
}
