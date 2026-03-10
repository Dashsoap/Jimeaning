"use client";

import { useLocale, useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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
        <div className="flex items-center justify-center h-64 text-[var(--color-text-tertiary)]">
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
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{t("title")}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator status={saveStatus} />
            <Button onClick={() => setShowAddProvider(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {t("addInstance")}
            </Button>
          </div>
        </div>

        {/* Default Models */}
        {enabledModels.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-white px-5 py-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("defaultModels")}</h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t("defaultModelsDesc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {defaultTypes.map(({ type, label, field }) => {
                const typeModels = enabledModels.filter((m) => m.type === type);
                const currentValue = defaults[field] || "";
                return (
                  <div key={type}>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">{label}</label>
                    <select
                      value={currentValue}
                      onChange={(e) => updateDefault(type, e.target.value || null)}
                      disabled={typeModels.length === 0}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
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
        <div className="space-y-3">
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
        <Modal open={showAddProvider} onClose={() => setShowAddProvider(false)} title={t("addInstance")}>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">{t("addInstanceDesc")}</p>
          <div className="space-y-1">
            <button
              onClick={() => {
                const id = `openai-compatible:${Date.now().toString(36)}`;
                addProvider({ id, name: "My API (OpenAI Compatible)", baseUrl: "" });
                setShowAddProvider(false);
              }}
              className="w-full text-left rounded-[var(--radius-md)] px-4 py-3 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
            >
              <div className="font-medium text-sm text-[var(--color-text-primary)]">OpenAI Compatible</div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
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

function SaveIndicator({ status }: { status: string }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving...
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-error)]">
        <AlertCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  return null;
}
