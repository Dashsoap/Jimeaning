"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Check,
  Server,
  Key,
  Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
}

interface Model {
  modelId: string;
  name: string;
  type: "llm" | "image" | "video" | "audio";
  provider: string;
  enabled: boolean;
}

interface ApiConfig {
  providers: Provider[];
  models: Model[];
  defaults: {
    llmModel: string | null;
    imageModel: string | null;
    videoModel: string | null;
    audioModel: string | null;
    ttsVoice: string;
    aspectRatio: string;
    style: string;
  };
}

// ─── Preset Data ──────────────────────────────────────────────────────────

const ADD_PROVIDER_OPTIONS = [
  { id: "openai-compatible", name: "OpenAI Compatible (NewAPI/OneAPI)", needsBaseUrl: true },
  { id: "fal", name: "FAL" },
  { id: "google", name: "Google AI Studio" },
  { id: "fish-audio", name: "Fish Audio" },
  { id: "elevenlabs", name: "ElevenLabs" },
];

const PRESET_MODELS: Array<{ modelId: string; name: string; type: Model["type"]; provider: string }> = [
  // OpenAI Compatible
  { modelId: "gpt-4o", name: "GPT-4o", type: "llm", provider: "openai-compatible" },
  { modelId: "gpt-4o-mini", name: "GPT-4o Mini", type: "llm", provider: "openai-compatible" },
  { modelId: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", type: "llm", provider: "openai-compatible" },
  { modelId: "deepseek-chat", name: "DeepSeek Chat", type: "llm", provider: "openai-compatible" },
  { modelId: "gpt-image-1", name: "GPT Image 1", type: "image", provider: "openai-compatible" },
  { modelId: "dall-e-3", name: "DALL-E 3", type: "image", provider: "openai-compatible" },
  { modelId: "sora", name: "Sora", type: "video", provider: "openai-compatible" },
  { modelId: "tts-1", name: "OpenAI TTS-1", type: "audio", provider: "openai-compatible" },
  { modelId: "tts-1-hd", name: "OpenAI TTS-1 HD", type: "audio", provider: "openai-compatible" },
  // FAL
  { modelId: "fal-ai/flux-pro/v1.1", name: "Flux Pro v1.1", type: "image", provider: "fal" },
  { modelId: "fal-ai/flux/dev", name: "Flux Dev", type: "image", provider: "fal" },
  { modelId: "fal-ai/kling-video/v1.6/pro/image-to-video", name: "Kling v1.6 Pro", type: "video", provider: "fal" },
  { modelId: "fal-ai/runway-gen3/turbo/image-to-video", name: "Runway Gen3 Turbo", type: "video", provider: "fal" },
  // Google
  { modelId: "gemini-2.0-flash-preview-image-generation", name: "Gemini Image Gen", type: "image", provider: "google" },
  { modelId: "imagen-3.0-generate-002", name: "Imagen 3", type: "image", provider: "google" },
  // Fish Audio
  { modelId: "default", name: "Fish Audio Default", type: "audio", provider: "fish-audio" },
  // ElevenLabs
  { modelId: "eleven_multilingual_v2", name: "Multilingual v2", type: "audio", provider: "elevenlabs" },
];

const TYPE_LABELS: Record<Model["type"], string> = {
  llm: "LLM",
  image: "Image",
  video: "Video",
  audio: "Audio",
};

const TYPE_COLORS: Record<Model["type"], string> = {
  llm: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  image: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  video: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  audio: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
};

// ─── Main Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();

  // State
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [defaults, setDefaults] = useState({
    ttsVoice: "alloy",
    aspectRatio: "16:9",
    style: "realistic",
  });
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [addModelProvider, setAddModelProvider] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Fetch config
  const { isLoading } = useQuery({
    queryKey: ["api-config"],
    queryFn: async () => {
      const res = await fetch("/api/user/api-config");
      const data: ApiConfig = await res.json();
      setProviders(data.providers || []);
      setModels(data.models || []);
      setDefaults((prev) => ({
        ...prev,
        ttsVoice: data.defaults?.ttsVoice || "alloy",
        aspectRatio: data.defaults?.aspectRatio || "16:9",
        style: data.defaults?.style || "realistic",
      }));
      return data;
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/api-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers,
          models,
          defaults: {
            ttsVoice: defaults.ttsVoice,
            aspectRatio: defaults.aspectRatio,
            style: defaults.style,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-config"] });
      setDirty(false);
      toast.success(t("saved"));
    },
    onError: () => {
      toast.error(t("saveFailed"));
    },
  });

  // ─── Provider Actions ─────────────────────────────────────────────────

  const addProvider = useCallback((option: typeof ADD_PROVIDER_OPTIONS[number]) => {
    const key = option.id;
    // For openai-compatible, allow multiple instances
    let id = key;
    if (key === "openai-compatible") {
      const count = providers.filter((p) => p.id.startsWith("openai-compatible")).length;
      id = count === 0 ? "openai-compatible" : `openai-compatible:${Date.now().toString(36)}`;
    }

    setProviders((prev) => [...prev, { id, name: option.name, baseUrl: option.needsBaseUrl ? "" : undefined }]);
    setExpandedProvider(id);
    setShowAddProvider(false);
    setDirty(true);
  }, [providers]);

  const removeProvider = useCallback((id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    setModels((prev) => prev.filter((m) => m.provider !== id));
    setDirty(true);
  }, []);

  const updateProvider = useCallback((id: string, updates: Partial<Provider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
    setDirty(true);
  }, []);

  // ─── Model Actions ────────────────────────────────────────────────────

  const addModel = useCallback((model: Omit<Model, "enabled">) => {
    setModels((prev) => {
      // Check for duplicates
      if (prev.some((m) => m.provider === model.provider && m.modelId === model.modelId)) {
        toast.error("Model already added");
        return prev;
      }
      return [...prev, { ...model, enabled: true }];
    });
    setDirty(true);
  }, []);

  const removeModel = useCallback((provider: string, modelId: string) => {
    setModels((prev) => prev.filter((m) => !(m.provider === provider && m.modelId === modelId)));
    setDirty(true);
  }, []);

  const toggleModel = useCallback((provider: string, modelId: string) => {
    setModels((prev) =>
      prev.map((m) =>
        m.provider === provider && m.modelId === modelId ? { ...m, enabled: !m.enabled } : m
      )
    );
    setDirty(true);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !dirty}
            size="md"
          >
            <Check className="mr-1.5 h-4 w-4" />
            {t("save")}
          </Button>
        </div>

        {/* Provider List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Server className="h-5 w-5" />
              {t("providers")}
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setShowAddProvider(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("addProvider")}
            </Button>
          </div>

          {providers.length === 0 && (
            <Card className="text-center py-8 text-gray-500">
              {t("noProviders")}
            </Card>
          )}

          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              models={models.filter((m) => m.provider === provider.id)}
              expanded={expandedProvider === provider.id}
              onToggleExpand={() =>
                setExpandedProvider((prev) => (prev === provider.id ? null : provider.id))
              }
              onUpdate={(updates) => updateProvider(provider.id, updates)}
              onRemove={() => removeProvider(provider.id)}
              onAddModel={() => setAddModelProvider(provider.id)}
              onRemoveModel={(modelId) => removeModel(provider.id, modelId)}
              onToggleModel={(modelId) => toggleModel(provider.id, modelId)}
            />
          ))}
        </div>

        {/* Default Settings */}
        <Card>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t("defaults")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="ttsVoice"
              label={t("ttsVoice")}
              value={defaults.ttsVoice}
              onChange={(e) => {
                setDefaults((p) => ({ ...p, ttsVoice: e.target.value }));
                setDirty(true);
              }}
            />
            <Input
              id="aspectRatio"
              label={t("aspectRatio")}
              value={defaults.aspectRatio}
              onChange={(e) => {
                setDefaults((p) => ({ ...p, aspectRatio: e.target.value }));
                setDirty(true);
              }}
            />
            <Input
              id="style"
              label={t("style")}
              value={defaults.style}
              onChange={(e) => {
                setDefaults((p) => ({ ...p, style: e.target.value }));
                setDirty(true);
              }}
            />
          </div>
        </Card>

        {/* Add Provider Modal */}
        <Modal
          open={showAddProvider}
          onClose={() => setShowAddProvider(false)}
          title={t("addProvider")}
        >
          <div className="space-y-2">
            {ADD_PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                onClick={() => addProvider(opt)}
              >
                <div className="font-medium">{opt.name}</div>
                {opt.needsBaseUrl && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {t("needsBaseUrl")}
                  </div>
                )}
              </button>
            ))}
          </div>
        </Modal>

        {/* Add Model Modal */}
        <AddModelModal
          providerId={addModelProvider}
          existingModels={models}
          onAdd={addModel}
          onClose={() => setAddModelProvider(null)}
          t={t}
        />
      </div>
    </AppShell>
  );
}

// ─── Provider Card Component ──────────────────────────────────────────────

function ProviderCard({
  provider,
  models,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onAddModel,
  onRemoveModel,
  onToggleModel,
}: {
  provider: Provider;
  models: Model[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Provider>) => void;
  onRemove: () => void;
  onAddModel: () => void;
  onRemoveModel: (modelId: string) => void;
  onToggleModel: (modelId: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const isOpenAICompat = provider.id.startsWith("openai-compatible");

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 flex-1 text-left"
          onClick={onToggleExpand}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-semibold">{provider.name}</span>
          {provider.hasApiKey && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Key className="h-3 w-3" />
              Connected
            </span>
          )}
          <span className="text-xs text-gray-400 ml-2">
            {models.length} model{models.length !== 1 ? "s" : ""}
          </span>
        </button>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4 dark:border-gray-700">
          {/* Base URL (for OpenAI-compatible) */}
          {(isOpenAICompat || provider.baseUrl !== undefined) && (
            <Input
              id={`${provider.id}-url`}
              label="Base URL"
              placeholder="https://api.example.com/v1"
              value={provider.baseUrl || ""}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            />
          )}

          {/* Provider Name (editable for multi-instance) */}
          {isOpenAICompat && (
            <Input
              id={`${provider.id}-name`}
              label="Display Name"
              value={provider.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          )}

          {/* API Key */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={provider.apiKey || ""}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                className="flex h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded-lg border border-gray-300 px-3 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Models</span>
              <Button variant="secondary" size="sm" onClick={onAddModel}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {models.length === 0 ? (
              <p className="text-sm text-gray-400">No models configured</p>
            ) : (
              <div className="space-y-1.5">
                {models.map((m) => (
                  <div
                    key={m.modelId}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm dark:border-gray-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[m.type]}`}>
                        {TYPE_LABELS[m.type]}
                      </span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{m.modelId}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onToggleModel(m.modelId)}
                        className={`rounded-full w-8 h-5 relative transition-colors ${
                          m.enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            m.enabled ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => onRemoveModel(m.modelId)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Add Model Modal ──────────────────────────────────────────────────────

function AddModelModal({
  providerId,
  existingModels,
  onAdd,
  onClose,
  t,
}: {
  providerId: string | null;
  existingModels: Model[];
  onAdd: (model: Omit<Model, "enabled">) => void;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [customModelId, setCustomModelId] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [customModelType, setCustomModelType] = useState<Model["type"]>("llm");

  if (!providerId) return null;

  const providerKey = providerId.includes(":") ? providerId.slice(0, providerId.indexOf(":")) : providerId;
  const presets = PRESET_MODELS.filter(
    (p) => p.provider === providerKey && !existingModels.some((m) => m.provider === providerId && m.modelId === p.modelId)
  );

  const handleAddCustom = () => {
    if (!customModelId.trim()) return;
    onAdd({
      modelId: customModelId.trim(),
      name: customModelName.trim() || customModelId.trim(),
      type: customModelType,
      provider: providerId,
    });
    setCustomModelId("");
    setCustomModelName("");
  };

  return (
    <Modal open={!!providerId} onClose={onClose} title={t("addModel")} className="max-w-xl">
      {/* Preset Models */}
      {presets.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t("presetModels")}</h3>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
            {presets.map((p) => (
              <button
                key={p.modelId}
                className="text-left px-3 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700 text-sm"
                onClick={() => {
                  onAdd({ modelId: p.modelId, name: p.name, type: p.type, provider: providerId });
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${TYPE_COLORS[p.type]}`}>
                    {TYPE_LABELS[p.type]}
                  </span>
                  <span className="font-medium">{p.name}</span>
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{p.modelId}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Model */}
      <div className="border-t pt-4 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-500 mb-2">{t("customModel")}</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              id="custom-model-id"
              placeholder="model-id"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              className="flex-1"
            />
            <Input
              id="custom-model-name"
              placeholder="Display name"
              value={customModelName}
              onChange={(e) => setCustomModelName(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={customModelType}
              onChange={(e) => setCustomModelType(e.target.value as Model["type"])}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            >
              {(["llm", "image", "video", "audio"] as const).map((type) => (
                <option key={type} value={type}>{TYPE_LABELS[type]}</option>
              ))}
            </select>
            <Button onClick={handleAddCustom} size="sm" disabled={!customModelId.trim()}>
              <Plus className="mr-1 h-4 w-4" />
              {t("addModel")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
