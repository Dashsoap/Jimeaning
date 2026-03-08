"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { composeModelKey } from "@/lib/api-config";
import {
  PRESET_PROVIDERS as _PRESET_PROVIDERS,
  PRESET_MODELS as SHARED_PRESET_MODELS,
  type ModelMediaType,
} from "@/lib/preset-models";

// ─── Types ────────────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
}

export type ModelType = ModelMediaType;

export interface CustomModel {
  modelId: string;
  modelKey: string;
  name: string;
  type: ModelType;
  provider: string;
  enabled: boolean;
}

// ─── Preset Providers ─────────────────────────────────────────────────────

export const PRESET_PROVIDERS: Omit<Provider, "apiKey" | "hasApiKey">[] = _PRESET_PROVIDERS;

const ZH_PROVIDER_NAME: Record<string, string> = {
  "openai-compatible": "OpenAI 兼容 (NewAPI/OneAPI)",
  "fish-audio": "Fish Audio 鱼声",
};

export function getProviderDisplayName(id: string, locale?: string): string {
  if (locale?.startsWith("zh")) {
    return ZH_PROVIDER_NAME[id] || PRESET_PROVIDERS.find((p) => p.id === id)?.name || id;
  }
  return PRESET_PROVIDERS.find((p) => p.id === id)?.name || id;
}

// ─── Preset Models ────────────────────────────────────────────────────────

export const PRESET_MODELS = SHARED_PRESET_MODELS;

// ─── Provider Tutorials ───────────────────────────────────────────────────

export interface TutorialStep {
  textZh: string;
  textEn: string;
  url?: string;
}

export const PROVIDER_TUTORIALS: Record<string, TutorialStep[]> = {
  "openai-compatible": [
    { textZh: "填写 Base URL 和 API Key 即可使用，支持 NewAPI / OneAPI / 官方 API", textEn: "Enter Base URL and API Key. Supports NewAPI / OneAPI / official API." },
  ],
  fal: [
    { textZh: "前往 FAL 控制台创建 API Key", textEn: "Go to FAL dashboard to create API Key", url: "https://fal.ai/dashboard/keys" },
  ],
  google: [
    { textZh: "前往 Google AI Studio 获取 API Key", textEn: "Go to Google AI Studio to get API Key", url: "https://aistudio.google.com/api-keys" },
  ],
  "fish-audio": [
    { textZh: "前往 Fish Audio 控制台获取 API Key", textEn: "Go to Fish Audio dashboard for API Key", url: "https://fish.audio/zh-CN/go-api/" },
  ],
  elevenlabs: [
    { textZh: "前往 ElevenLabs 获取 API Key", textEn: "Go to ElevenLabs for API Key", url: "https://elevenlabs.io/api" },
  ],
};

// ─── Helper ───────────────────────────────────────────────────────────────

export function getProviderKey(providerId: string): string {
  const colonIndex = providerId.indexOf(":");
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex);
}

// ─── Defaults Type ────────────────────────────────────────────────────────

export interface ModelDefaults {
  llmModel: string | null;
  imageModel: string | null;
  videoModel: string | null;
  audioModel: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>(
    PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: "", hasApiKey: false }))
  );
  const [models, setModels] = useState<CustomModel[]>(
    PRESET_MODELS.map((m) => ({
      ...m,
      modelKey: composeModelKey(m.provider, m.modelId),
      enabled: false,
    }))
  );
  const [defaults, setDefaults] = useState<ModelDefaults>({
    llmModel: null,
    imageModel: null,
    videoModel: null,
    audioModel: null,
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const latestProvidersRef = useRef(providers);
  const latestModelsRef = useRef(models);
  const latestDefaultsRef = useRef(defaults);
  const initializedRef = useRef(false);

  useEffect(() => { latestProvidersRef.current = providers; }, [providers]);
  useEffect(() => { latestModelsRef.current = models; }, [models]);
  useEffect(() => { latestDefaultsRef.current = defaults; }, [defaults]);

  // Load config
  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchConfig() {
    initializedRef.current = false;
    try {
      const res = await fetch("/api/user/api-config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Merge preset and saved providers
      const savedProviders: Provider[] = data.providers || [];
      const mergedProviders = PRESET_PROVIDERS.map((preset) => {
        const saved = savedProviders.find((p) => getProviderKey(p.id) === preset.id);
        return {
          ...preset,
          apiKey: saved?.apiKey || "",
          hasApiKey: !!saved?.apiKey,
          baseUrl: saved?.baseUrl || preset.baseUrl,
        };
      });
      // Add custom openai-compatible instances
      const customProviders = savedProviders.filter(
        (p) => !PRESET_PROVIDERS.find((preset) => preset.id === getProviderKey(p.id))
      ).map((p) => ({ ...p, hasApiKey: !!p.apiKey }));
      setProviders([...mergedProviders, ...customProviders]);

      // Merge preset and saved models
      const savedModels: CustomModel[] = (data.models || []).map((m: CustomModel) => ({
        ...m,
        modelKey: m.modelKey || composeModelKey(m.provider, m.modelId),
      }));
      const hasSaved = savedModels.length > 0;
      const mergedModels = PRESET_MODELS.map((preset) => {
        const key = composeModelKey(preset.provider, preset.modelId);
        const saved = savedModels.find((m: CustomModel) => m.modelKey === key);
        return {
          ...preset,
          modelKey: key,
          enabled: hasSaved ? !!saved : false,
        };
      });
      const customModels = savedModels.filter(
        (m: CustomModel) => !PRESET_MODELS.find((p) => composeModelKey(p.provider, p.modelId) === m.modelKey)
      ).map((m: CustomModel) => ({ ...m, enabled: m.enabled !== false }));
      setModels([...mergedModels, ...customModels]);

      // Load defaults
      if (data.defaults) {
        const d: ModelDefaults = {
          llmModel: data.defaults.llmModel || null,
          imageModel: data.defaults.imageModel || null,
          videoModel: data.defaults.videoModel || null,
          audioModel: data.defaults.audioModel || null,
        };
        setDefaults(d);
        latestDefaultsRef.current = d;
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setLoading(false);
      setTimeout(() => { initializedRef.current = true; }, 100);
    }
  }

  // Auto-save (optimistic)
  const performSave = useCallback(async () => {
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
    try {
      const currentProviders = latestProvidersRef.current;
      const currentModels = latestModelsRef.current.filter((m) => m.enabled);
      const currentDefaults = latestDefaultsRef.current;
      const res = await fetch("/api/user/api-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: currentProviders,
          models: currentModels,
          defaults: currentDefaults,
        }),
      });
      if (!res.ok) {
        setSaveStatus("error");
        toast.error("Save failed");
      }
    } catch {
      setSaveStatus("error");
      toast.error("Save failed");
    }
  }, []);

  // Provider actions
  const updateProviderApiKey = useCallback((providerId: string, apiKey: string) => {
    setProviders((prev) => {
      const next = prev.map((p) =>
        p.id === providerId ? { ...p, apiKey, hasApiKey: !!apiKey } : p
      );
      latestProvidersRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const updateProviderBaseUrl = useCallback((providerId: string, baseUrl: string) => {
    setProviders((prev) => {
      const next = prev.map((p) =>
        p.id === providerId ? { ...p, baseUrl } : p
      );
      latestProvidersRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const addProvider = useCallback((provider: Omit<Provider, "hasApiKey">) => {
    setProviders((prev) => {
      if (prev.some((p) => p.id.toLowerCase() === provider.id.toLowerCase())) {
        toast.error("Provider already exists");
        return prev;
      }
      const next = [...prev, { ...provider, hasApiKey: !!provider.apiKey }];
      latestProvidersRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const deleteProvider = useCallback((providerId: string) => {
    if (PRESET_PROVIDERS.find((p) => p.id === providerId)) {
      toast.error("Cannot delete preset provider");
      return;
    }
    setProviders((prev) => {
      const next = prev.filter((p) => p.id !== providerId);
      latestProvidersRef.current = next;
      return next;
    });
    setModels((prev) => {
      const next = prev.filter((m) => m.provider !== providerId);
      latestModelsRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const updateProviderName = useCallback((providerId: string, name: string) => {
    setProviders((prev) => {
      const next = prev.map((p) =>
        p.id === providerId ? { ...p, name } : p
      );
      latestProvidersRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  // Model actions
  const toggleModel = useCallback((modelKey: string) => {
    setModels((prev) => {
      const next = prev.map((m) =>
        m.modelKey === modelKey ? { ...m, enabled: !m.enabled } : m
      );
      latestModelsRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const addModel = useCallback((model: Omit<CustomModel, "enabled">) => {
    setModels((prev) => {
      const key = model.modelKey || composeModelKey(model.provider, model.modelId);
      if (prev.some((m) => m.modelKey === key)) {
        toast.error("Model already exists");
        return prev;
      }
      const next = [...prev, { ...model, modelKey: key, enabled: true }];
      latestModelsRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  const deleteModel = useCallback((modelKey: string) => {
    if (PRESET_MODELS.find((m) => composeModelKey(m.provider, m.modelId) === modelKey)) {
      toast.error("Cannot delete preset model, toggle it off instead");
      return;
    }
    setModels((prev) => {
      const next = prev.filter((m) => m.modelKey !== modelKey);
      latestModelsRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  // Default model actions
  const updateDefault = useCallback((type: ModelType, modelKey: string | null) => {
    setDefaults((prev) => {
      const fieldMap: Record<ModelType, keyof ModelDefaults> = {
        llm: "llmModel",
        image: "imageModel",
        video: "videoModel",
        audio: "audioModel",
      };
      const next = { ...prev, [fieldMap[type]]: modelKey };
      latestDefaultsRef.current = next;
      void performSave();
      return next;
    });
  }, [performSave]);

  return {
    providers,
    models,
    defaults,
    loading,
    saveStatus,
    updateProviderApiKey,
    updateProviderBaseUrl,
    addProvider,
    deleteProvider,
    updateProviderName,
    toggleModel,
    addModel,
    deleteModel,
    updateDefault,
  };
}
