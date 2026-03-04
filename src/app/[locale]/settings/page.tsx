"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

const API_KEY_FIELDS = [
  { key: "openai", label: "OpenAI" },
  { key: "fal", label: "FAL (Flux/Kling)" },
  { key: "google", label: "Google (Gemini)" },
  { key: "fishAudio", label: "Fish Audio" },
  { key: "elevenLabs", label: "ElevenLabs" },
] as const;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: () => fetch("/api/user/preferences").then((r) => r.json()),
  });

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState({
    llm: "gpt-4o",
    image: "gpt-image-1",
    video: "sora",
    ttsProvider: "openai",
    ttsModel: "tts-1",
    ttsVoice: "alloy",
  });

  useEffect(() => {
    if (prefs) {
      if (prefs.apiKeys) {
        const keys: Record<string, string> = {};
        for (const f of API_KEY_FIELDS) {
          keys[f.key] = prefs.apiKeys[f.key] || "";
        }
        setApiKeys(keys);
      }
      if (prefs.models) {
        setModels((prev) => ({ ...prev, ...prefs.models }));
      }
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: (data: { apiKeys: Record<string, string>; models: typeof models }) =>
      fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      toast.success("Saved");
    },
  });

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>

        <Card>
          <h2 className="text-lg font-semibold mb-4">{t("apiKeys")}</h2>
          <div className="space-y-3">
            {API_KEY_FIELDS.map((f) => (
              <Input
                key={f.key}
                id={f.key}
                label={f.label}
                type="password"
                placeholder="sk-..."
                value={apiKeys[f.key] || ""}
                onChange={(e) =>
                  setApiKeys((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4">{t("models")}</h2>
          <div className="space-y-3">
            <Input
              id="llm"
              label="LLM Model"
              value={models.llm}
              onChange={(e) => setModels((p) => ({ ...p, llm: e.target.value }))}
            />
            <Input
              id="image"
              label="Image Model"
              value={models.image}
              onChange={(e) => setModels((p) => ({ ...p, image: e.target.value }))}
            />
            <Input
              id="video"
              label="Video Model"
              value={models.video}
              onChange={(e) => setModels((p) => ({ ...p, video: e.target.value }))}
            />
            <Input
              id="ttsProvider"
              label="TTS Provider"
              value={models.ttsProvider}
              onChange={(e) => setModels((p) => ({ ...p, ttsProvider: e.target.value }))}
            />
          </div>
        </Card>

        <Button
          onClick={() => saveMutation.mutate({ apiKeys, models })}
          disabled={saveMutation.isPending}
          size="lg"
        >
          {t("save")}
        </Button>
      </div>
    </AppShell>
  );
}
