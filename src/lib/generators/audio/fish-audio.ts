import type {
  AudioGenerator,
  AudioGenerateParams,
  GenerateResult,
  ProviderConfig,
} from "../types";

export class FishAudioGenerator implements AudioGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.fish.audio";
  }

  async generate(params: AudioGenerateParams): Promise<GenerateResult> {
    const response = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: params.text,
        reference_id: params.voiceId,
        format: "mp3",
        mp3_bitrate: 128,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fish Audio TTS failed: ${error}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString("base64"),
    };
  }
}
