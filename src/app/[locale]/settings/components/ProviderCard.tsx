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
  llm: { label: "LLM", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  image: { label: "Image", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  video: { label: "Video", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  audio: { label: "Audio", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
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
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
        <span className="font-semibold text-sm flex-1">{provider.name}</span>
        {provider.hasApiKey && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        )}
        {enabledCount > 0 && (
          <span className="text-xs text-gray-400">{enabledCount} models</span>
        )}
        {isCustom && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteProvider(provider.id); }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-400" />
          </button>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {/* Tutorial */}
          {tutorial && (
            <div className="px-4 pt-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 space-y-1">
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
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-gray-500">API Key</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/30">
            <Check className="h-3.5 w-3.5 text-green-600" />
          </button>
          <button onClick={() => { setEditing(false); setTempKey(""); }} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          {provider.hasApiKey ? (
            <>
              <span className="flex-1 truncate rounded-md bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-mono text-gray-500">
                {showKey ? provider.apiKey : maskedKey}
              </span>
              <button onClick={() => setShowKey(!showKey)} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
                {showKey ? <EyeOff className="h-3.5 w-3.5 text-gray-400" /> : <Eye className="h-3.5 w-3.5 text-gray-400" />}
              </button>
              <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
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
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-gray-500">Base URL</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/30">
            <Check className="h-3.5 w-3.5 text-green-600" />
          </button>
          <button onClick={() => { setEditing(false); setTempUrl(provider.baseUrl || ""); }} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          {provider.baseUrl ? (
            <>
              <span className="flex-1 truncate rounded-md bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-mono text-gray-500">
                {provider.baseUrl}
              </span>
              <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
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
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-gray-500">Name</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button onClick={handleSave} className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/30">
            <Check className="h-3.5 w-3.5 text-green-600" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          <span className="flex-1 text-xs">{provider.name}</span>
          <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700">
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
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
        <span className="text-xs font-semibold text-gray-500">Models</span>
        <div className="flex items-center gap-2">
          {canFetchModels && (
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
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
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <Plus className="h-3 w-3" />
            Custom
          </button>
        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="mb-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {t("importModels")}
              </span>
              <span className="text-xs text-gray-500 ml-2">
                {discoveredModels.length} {t("importModelsDesc").toLowerCase().includes("select") ? "found" : ""}
              </span>
            </div>
            <button
              onClick={() => setShowImportDialog(false)}
              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          {discoveredModels.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t("noModelsFound")}</p>
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
                        className="text-[10px] font-semibold text-gray-500 uppercase mb-1 hover:text-gray-700 dark:hover:text-gray-300"
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
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-all ${
                                added
                                  ? "border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed"
                                  : selected
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                              }`}
                            >
                              {added ? (
                                <Check className="h-3 w-3 text-gray-400" />
                              ) : selected ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : null}
                              <span className="max-w-[200px] truncate">{d.modelId}</span>
                              {added && (
                                <span className="text-[10px] text-gray-400">{t("alreadyAdded")}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                <button
                  onClick={handleImportSelected}
                  disabled={selectedImports.size === 0}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
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
        <div className="mb-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              placeholder="model-id"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
            />
            <input
              placeholder="Display name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as ModelType)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {(["llm", "image", "video", "audio"] as const).map((t) => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
            <button
              onClick={handleAddCustom}
              disabled={!customId.trim()}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddCustom(false)}
              className="rounded-md px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
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
                  className={`group relative inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-all ${
                    m.enabled
                      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 dark:hover:border-gray-600"
                  }`}
                >
                  <TypeBadge type={m.type} />
                  <span className={m.enabled ? "font-medium" : ""}>{m.name}</span>
                  {!isPreset(m.modelKey) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(m.modelKey); }}
                      className="ml-0.5 hidden rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 group-hover:inline-block"
                    >
                      <X className="h-3 w-3 text-red-400" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {models.length === 0 && (
        <p className="text-xs text-gray-400 italic">No models available</p>
      )}
    </div>
  );
}
