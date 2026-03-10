"use client";

import { useState } from "react";
import {
  Check,
  X,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { Provider, CustomModel, ModelType, TutorialStep } from "./hooks";
import {
  getProviderKey,
  PRESET_MODELS,
  PROVIDER_TUTORIALS,
} from "./hooks";
import { composeModelKey } from "@/lib/api-config";
import type { ModelMediaType } from "@/lib/preset-models";

// ─── Type Badge ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ModelType, { label: string; color: string }> = {
  llm: { label: "LLM", color: "bg-blue-100 text-blue-700" },
  image: { label: "Image", color: "bg-emerald-100 text-emerald-700" },
  video: { label: "Video", color: "bg-violet-100 text-violet-700" },
  audio: { label: "Audio", color: "bg-amber-100 text-amber-700" },
};

function TypeBadge({ type }: { type: ModelType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: Provider;
  models: CustomModel[];
  locale: string;
  onUpdateApiKey: (id: string, key: string) => void;
  onUpdateBaseUrl: (id: string, url: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onDeleteProvider: (id: string) => void;
  onToggleModel: (modelKey: string) => void;
  onAddModel: (model: Omit<CustomModel, "enabled">) => void;
  onDeleteModel: (modelKey: string) => void;
}

export function ProviderCard({
  provider,
  models,
  locale,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onUpdateName,
  onDeleteProvider,
  onToggleModel,
  onAddModel,
  onDeleteModel,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const providerKey = getProviderKey(provider.id);
  const isCustom = !["openai-compatible", "fal", "google", "fish-audio", "elevenlabs"].includes(providerKey);
  const showBaseUrl = providerKey === "openai-compatible" || providerKey === "google";
  const enabledCount = models.filter((m) => m.enabled).length;
  const tutorial = PROVIDER_TUTORIALS[providerKey];

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white overflow-hidden">
      {/* Header */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)] shrink-0" />}
        <span className="font-semibold text-sm flex-1">{provider.name}</span>
        {provider.hasApiKey && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            Connected
          </span>
        )}
        {enabledCount > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">{enabledCount} models</span>
        )}
        {isCustom && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteProvider(provider.id); }}
            className="p-1 rounded hover:bg-[var(--color-danger-light)] cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
          </button>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-[var(--color-border-light)]">
          {/* Tutorial */}
          {tutorial && (
            <div className="px-4 pt-3">
              <div className="rounded-[var(--radius-md)] bg-[var(--color-accent-light)] px-3 py-2 text-xs text-[var(--color-accent)] space-y-1">
                {tutorial.map((step: TutorialStep, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span>{locale.startsWith("zh") ? step.textZh : step.textEn}</span>
                    {step.url && (
                      <a href={step.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline hover:no-underline">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Key */}
          <div className="px-4 pt-3">
            <ApiKeyField
              provider={provider}
              onSave={(key) => onUpdateApiKey(provider.id, key)}
            />
          </div>

          {/* Base URL (for openai-compatible) */}
          {showBaseUrl && (
            <div className="px-4 pt-2">
              <BaseUrlField
                provider={provider}
                onSave={(url) => onUpdateBaseUrl(provider.id, url)}
              />
            </div>
          )}

          {/* Custom name for extra instances */}
          {isCustom && (
            <div className="px-4 pt-2">
              <NameField
                provider={provider}
                onSave={(name) => onUpdateName(provider.id, name)}
              />
            </div>
          )}

          {/* Models */}
          <div className="px-4 pt-3 pb-3">
            <ModelList
              providerId={provider.id}
              provider={provider}
              models={models}
              onToggle={onToggleModel}
              onAdd={onAddModel}
              onDelete={onDeleteModel}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── API Key Field ────────────────────────────────────────────────────────

function ApiKeyField({
  provider,
  onSave,
}: {
  provider: Provider;
  onSave: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const maskedKey = provider.apiKey
    ? provider.apiKey.length > 12
      ? `${provider.apiKey.slice(0, 4)}${"*".repeat(8)}${provider.apiKey.slice(-4)}`
      : "****"
    : "";

  const handleSave = () => {
    if (tempKey.trim()) {
      onSave(tempKey.trim());
    }
    setEditing(false);
    setTempKey("");
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-text-secondary)]">API Key</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-[var(--color-success-light)] cursor-pointer">
            <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
          </button>
          <button onClick={() => { setEditing(false); setTempKey(""); }} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
            <X className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          {provider.hasApiKey ? (
            <>
              <span className="flex-1 truncate rounded-md bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-xs font-mono text-[var(--color-text-secondary)]">
                {showKey ? provider.apiKey : maskedKey}
              </span>
              <button onClick={() => setShowKey(!showKey)} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
                {showKey ? <EyeOff className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" /> : <Eye className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />}
              </button>
              <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
                <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Connect
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Base URL Field ───────────────────────────────────────────────────────

function BaseUrlField({
  provider,
  onSave,
}: {
  provider: Provider;
  onSave: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(provider.baseUrl || "");

  const handleSave = () => {
    onSave(tempUrl.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-text-secondary)]">Base URL</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-[var(--color-success-light)] cursor-pointer">
            <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
          </button>
          <button onClick={() => { setEditing(false); setTempUrl(provider.baseUrl || ""); }} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
            <X className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          {provider.baseUrl ? (
            <>
              <span className="flex-1 truncate rounded-md bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-xs font-mono text-[var(--color-text-secondary)]">
                {provider.baseUrl}
              </span>
              <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
                <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Set Base URL
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Name Field ───────────────────────────────────────────────────────────

function NameField({
  provider,
  onSave,
}: {
  provider: Provider;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(provider.name);

  const handleSave = () => {
    if (tempName.trim()) onSave(tempName.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-[var(--color-text-secondary)]">Name</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-[var(--color-success-light)] cursor-pointer">
            <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          <span className="flex-1 text-xs">{provider.name}</span>
          <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer">
            <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Discovered Model Type ────────────────────────────────────────────────

interface DiscoveredModel {
  modelId: string;
  name: string;
  type: ModelMediaType;
}

// ─── Model List ───────────────────────────────────────────────────────────

function ModelList({
  providerId,
  provider,
  models,
  onToggle,
  onAdd,
  onDelete,
}: {
  providerId: string;
  provider: Provider;
  models: CustomModel[];
  onToggle: (modelKey: string) => void;
  onAdd: (model: Omit<CustomModel, "enabled">) => void;
  onDelete: (modelKey: string) => void;
}) {
  const t = useTranslations("settings");
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<ModelType>("llm");

  // Fetch Models state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());

  const providerKey = getProviderKey(providerId);
  const canFetchModels = providerKey === "openai-compatible" && provider.hasApiKey;

  const isPreset = (mk: string) =>
    PRESET_MODELS.some((p) => composeModelKey(p.provider, p.modelId) === mk);

  const isAlreadyAdded = (modelId: string) =>
    models.some((m) => m.modelId === modelId);

  // Group models by type
  const types = (["llm", "image", "video", "audio"] as ModelType[]).filter((t) =>
    models.some((m) => m.type === t)
  );

  const handleAddCustom = () => {
    if (!customId.trim()) return;
    onAdd({
      modelId: customId.trim(),
      modelKey: composeModelKey(providerId, customId.trim()),
      name: customName.trim() || customId.trim(),
      type: customType,
      provider: providerId,
    });
    setCustomId("");
    setCustomName("");
    setShowAddCustom(false);
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/user/api-config/discover-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const discovered: DiscoveredModel[] = data.models || [];
      setDiscoveredModels(discovered);
      setSelectedImports(new Set());
      setShowImportDialog(true);
    } catch (err) {
      toast.error(t("fetchFailed") + (err instanceof Error ? `: ${err.message}` : ""));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleImportSelected = () => {
    let count = 0;
    for (const modelId of selectedImports) {
      const disc = discoveredModels.find((d) => d.modelId === modelId);
      if (!disc || isAlreadyAdded(modelId)) continue;
      onAdd({
        modelId: disc.modelId,
        modelKey: composeModelKey(providerId, disc.modelId),
        name: disc.name,
        type: disc.type,
        provider: providerId,
      });
      count++;
    }
    if (count > 0) {
      toast.success(t("modelsImported", { count }));
    }
    setShowImportDialog(false);
  };

  const toggleImportSelection = (modelId: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const toggleAllOfType = (type: ModelMediaType) => {
    const typeModels = discoveredModels.filter((d) => d.type === type && !isAlreadyAdded(d.modelId));
    const allSelected = typeModels.every((d) => selectedImports.has(d.modelId));
    setSelectedImports((prev) => {
      const next = new Set(prev);
      for (const d of typeModels) {
        if (allSelected) next.delete(d.modelId);
        else next.add(d.modelId);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Models</span>
        <div className="flex items-center gap-2">
          {canFetchModels && (
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {fetchingModels ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {fetchingModels ? t("fetchingModels") : t("fetchModels")}
            </button>
          )}
          <button
            onClick={() => setShowAddCustom(!showAddCustom)}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            Custom
          </button>
        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="mb-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-semibold text-emerald-700">
                {t("importModels")}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)] ml-2">
                {discoveredModels.length} {t("importModelsDesc").toLowerCase().includes("select") ? "found" : ""}
              </span>
            </div>
            <button
              onClick={() => setShowImportDialog(false)}
              className="rounded p-1 hover:bg-[var(--color-bg-tertiary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
            </button>
          </div>

          {discoveredModels.length === 0 ? (
            <p className="text-xs text-[var(--color-text-tertiary)] italic">{t("noModelsFound")}</p>
          ) : (
            <>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {(["llm", "image", "video", "audio"] as ModelMediaType[]).map((type) => {
                  const typeModels = discoveredModels.filter((d) => d.type === type);
                  if (typeModels.length === 0) return null;
                  return (
                    <div key={type}>
                      <button
                        onClick={() => toggleAllOfType(type)}
                        className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-1 hover:text-[var(--color-text)] cursor-pointer"
                      >
                        {TYPE_CONFIG[type].label} ({typeModels.length})
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {typeModels.map((d) => {
                          const added = isAlreadyAdded(d.modelId);
                          const selected = selectedImports.has(d.modelId);
                          return (
                            <button
                              key={d.modelId}
                              onClick={() => !added && toggleImportSelection(d.modelId)}
                              disabled={added}
                              className={`inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-xs transition-all cursor-pointer ${
                                added
                                  ? "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed"
                                  : selected
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
                              }`}
                            >
                              {added ? (
                                <Check className="h-3 w-3 text-[var(--color-text-tertiary)]" />
                              ) : selected ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : null}
                              <span className="max-w-[200px] truncate">{d.modelId}</span>
                              {added && (
                                <span className="text-[10px] text-[var(--color-text-tertiary)]">{t("alreadyAdded")}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-2 pt-2 border-t border-emerald-200">
                <button
                  onClick={handleImportSelected}
                  disabled={selectedImports.size === 0}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {t("importSelected")} ({selectedImports.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Custom model form */}
      {showAddCustom && (
        <div className="mb-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              placeholder="model-id"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
            />
            <input
              placeholder="Display name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as ModelType)}
              className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs"
            >
              {(["llm", "image", "video", "audio"] as const).map((t) => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
            <button
              onClick={handleAddCustom}
              disabled={!customId.trim()}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddCustom(false)}
              className="rounded-md px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Model groups by type */}
      {types.map((type) => {
        const typeModels = models.filter((m) => m.type === type);
        return (
          <div key={type} className="mb-1.5">
            <div className="flex flex-wrap gap-1">
              {typeModels.map((m) => (
                <button
                  key={m.modelKey}
                  onClick={() => onToggle(m.modelKey)}
                  className={`group relative inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-xs transition-all cursor-pointer ${
                    m.enabled
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-white text-[var(--color-text-tertiary)] hover:border-[var(--color-border)]"
                  }`}
                >
                  <TypeBadge type={m.type} />
                  <span className={m.enabled ? "font-medium" : ""}>{m.name}</span>
                  {!isPreset(m.modelKey) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(m.modelKey); }}
                      className="ml-0.5 hidden rounded p-0.5 hover:bg-[var(--color-danger-light)] group-hover:inline-block cursor-pointer"
                    >
                      <X className="h-3 w-3 text-[var(--color-danger)]" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {models.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] italic">No models available</p>
      )}
    </div>
  );
}
