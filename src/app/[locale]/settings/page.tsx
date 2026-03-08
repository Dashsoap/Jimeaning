"use client";

import { useLocale, useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useState } from "react";
import { Plus, Check, Loader2, AlertCircle } from "lucide-react";
import { useProviders, getProviderKey, type ModelType } from "./components/hooks";
import { ProviderCard } from "./components/ProviderCard";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [showAddProvider, setShowAddProvider] = useState(false);

  const {
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
  } = useProviders();

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading...
        </div>
      </AppShell>
    );
  }

  const enabledModels = models.filter((m) => m.enabled);

  const defaultTypes: { type: ModelType; label: string; field: keyof typeof defaults }[] = [
    { type: "llm", label: t("defaultLlm"), field: "llmModel" },
    { type: "image", label: t("defaultImage"), field: "imageModel" },
    { type: "video", label: t("defaultVideo"), field: "videoModel" },
    { type: "audio", label: t("defaultAudio"), field: "audioModel" },
  ];

  return (
    <AppShell>
      <div className="max-w-3xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{t("title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Save Status */}
            <SaveIndicator status={saveStatus} />
            {/* Add Provider */}
            <button
              onClick={() => setShowAddProvider(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("addInstance")}
            </button>
          </div>
        </div>

        {/* Default Models */}
        {enabledModels.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 px-4 py-3">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">{t("defaultModels")}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t("defaultModelsDesc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {defaultTypes.map(({ type, label, field }) => {
                const typeModels = enabledModels.filter((m) => m.type === type);
                const currentValue = defaults[field] || "";
                return (
                  <div key={type}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <select
                      value={currentValue}
                      onChange={(e) => updateDefault(type, e.target.value || null)}
                      disabled={typeModels.length === 0}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-50"
                    >
                      <option value="">{t("autoFirstEnabled")}</option>
                      {typeModels.map((m) => (
                        <option key={m.modelKey} value={m.modelKey}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider Cards */}
        <div className="space-y-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              models={models.filter(
                (m) => m.provider === provider.id || getProviderKey(m.provider) === getProviderKey(provider.id)
              )}
              locale={locale}
              onUpdateApiKey={updateProviderApiKey}
              onUpdateBaseUrl={updateProviderBaseUrl}
              onUpdateName={updateProviderName}
              onDeleteProvider={deleteProvider}
              onToggleModel={toggleModel}
              onAddModel={addModel}
              onDeleteModel={deleteModel}
            />
          ))}
        </div>

        {/* Add Provider Modal */}
        <Modal
          open={showAddProvider}
          onClose={() => setShowAddProvider(false)}
          title={t("addInstance")}
        >
          <p className="text-sm text-gray-500 mb-3">{t("addInstanceDesc")}</p>
          <div className="space-y-1">
            <button
              onClick={() => {
                const id = `openai-compatible:${Date.now().toString(36)}`;
                addProvider({ id, name: "My API (OpenAI Compatible)", baseUrl: "" });
                setShowAddProvider(false);
              }}
              className="w-full text-left rounded-lg px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="font-medium text-sm">OpenAI Compatible</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {locale.startsWith("zh")
                  ? "添加自定义 OpenAI 兼容端点（NewAPI / OneAPI / 自建转发等）"
                  : "Add custom OpenAI-compatible endpoint (NewAPI / OneAPI / self-hosted)"}
              </div>
            </button>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

// ─── Save Status Indicator ────────────────────────────────────────────────

function SaveIndicator({ status }: { status: string }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving...
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <AlertCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  return null;
}
