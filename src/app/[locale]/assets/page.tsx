"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Plus,
  Trash2,
  User as UserIcon,
  MapPin,
  Mic,
  Sparkles,
  Image as ImageIcon,
  ChevronRight,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

type Tab = "characters" | "locations" | "voices";

interface Appearance {
  id: string;
  characterId: string;
  appearanceIndex: number;
  description: string | null;
  imageUrl: string | null;
  candidateImages: string | null;
  selectedIndex: number | null;
  changeReason: string | null;
}

interface Character {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  voiceProvider: string | null;
  voiceId: string | null;
  globalVoiceId: string | null;
  appearances: Appearance[];
  createdAt: string;
}

interface Location {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface Voice {
  id: string;
  name: string;
  description: string | null;
  provider: string | null;
  voiceId: string | null;
  gender: string | null;
  language: string;
  createdAt: string;
}

// ─── Character Detail Modal ──────────────────────────────────────────────

function CharacterDetailModal({
  character,
  onClose,
  voices,
}: {
  character: Character;
  onClose: () => void;
  voices: Voice[];
}) {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [newAppDesc, setNewAppDesc] = useState("");
  const [newAppReason, setNewAppReason] = useState("");
  const [showAddAppearance, setShowAddAppearance] = useState(false);

  const addAppearanceMutation = useMutation({
    mutationFn: (data: { description: string; changeReason: string }) =>
      fetch(`/api/asset-hub/characters/${character.id}/appearances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Create failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-characters"] });
      setShowAddAppearance(false);
      setNewAppDesc("");
      setNewAppReason("");
      toast.success(tc("success"));
    },
    onError: () => toast.error(tc("error")),
  });

  const generateAppImageMutation = useMutation({
    mutationFn: ({
      appearanceIndex,
      prompt,
    }: {
      appearanceIndex: number;
      prompt?: string;
    }) =>
      fetch(
        `/api/asset-hub/characters/${character.id}/appearances/${appearanceIndex}/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      ).then((r) => {
        if (!r.ok) throw new Error("Generate failed");
        return r.json();
      }),
    onSuccess: () => toast.success(t("imageGenerating")),
    onError: () => toast.error(tc("error")),
  });

  const selectImageMutation = useMutation({
    mutationFn: (data: {
      characterId: string;
      appearanceIndex: number;
      selectedIndex?: number;
      confirm?: boolean;
    }) =>
      fetch("/api/asset-hub/select-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "character", ...data }),
      }).then((r) => {
        if (!r.ok) throw new Error("Select failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-characters"] });
    },
    onError: () => toast.error(tc("error")),
  });

  const bindVoiceMutation = useMutation({
    mutationFn: (globalVoiceId: string | null) =>
      fetch(`/api/asset-hub/characters/${character.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalVoiceId }),
      }).then((r) => {
        if (!r.ok) throw new Error("Update failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-characters"] });
      toast.success(tc("success"));
    },
    onError: () => toast.error(tc("error")),
  });

  const deleteAppearanceMutation = useMutation({
    mutationFn: (appearanceIndex: number) =>
      fetch(
        `/api/asset-hub/characters/${character.id}/appearances/${appearanceIndex}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-characters"] });
      toast.success(tc("success"));
    },
    onError: () => toast.error(tc("error")),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={character.name}
      className="max-w-2xl max-h-[85vh] overflow-y-auto"
    >
      {/* Character info */}
      {character.description && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{character.description}</p>
      )}

      {/* Voice binding */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
          {t("bindVoice")}
        </label>
        <select
          value={character.globalVoiceId || ""}
          onChange={(e) =>
            bindVoiceMutation.mutate(e.target.value || null)
          }
          className="w-full cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm"
        >
          <option value="">{t("noVoice")}</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} {v.provider ? `(${v.provider})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Appearances */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("appearances")}</h3>
        <button
          onClick={() => setShowAddAppearance(true)}
          className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-btn-primary-hover)] cursor-pointer"
        >
          <Plus size={14} />
          {t("addAppearance")}
        </button>
      </div>

      {/* Add appearance form */}
      {showAddAppearance && (
        <div className="mb-4 p-3 border border-[var(--color-border-default)] rounded-[var(--radius-md)] space-y-2">
          <Input
            id="app-desc"
            label={t("appearanceDesc")}
            value={newAppDesc}
            onChange={(e) => setNewAppDesc(e.target.value)}
            placeholder={t("appearanceDescPlaceholder")}
          />
          <Input
            id="app-reason"
            label={t("changeReason")}
            value={newAppReason}
            onChange={(e) => setNewAppReason(e.target.value)}
            placeholder={t("changeReasonPlaceholder")}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowAddAppearance(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={() =>
                addAppearanceMutation.mutate({
                  description: newAppDesc,
                  changeReason: newAppReason,
                })
              }
              disabled={addAppearanceMutation.isPending}
            >
              {tc("create")}
            </Button>
          </div>
        </div>
      )}

      {/* Appearance list */}
      <div className="space-y-4">
        {character.appearances.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">
            {t("noAppearances")}
          </p>
        ) : (
          character.appearances.map((app) => (
            <AppearanceCard
              key={app.id}
              appearance={app}
              onGenerateImage={(idx) =>
                generateAppImageMutation.mutate({ appearanceIndex: idx })
              }
              onSelectImage={(idx, selectedIndex) =>
                selectImageMutation.mutate({
                  characterId: character.id,
                  appearanceIndex: idx,
                  selectedIndex,
                })
              }
              onConfirmImage={(idx) =>
                selectImageMutation.mutate({
                  characterId: character.id,
                  appearanceIndex: idx,
                  confirm: true,
                })
              }
              onDelete={(idx) => {
                if (confirm(tc("delete") + "?")) {
                  deleteAppearanceMutation.mutate(idx);
                }
              }}
              isGenerating={generateAppImageMutation.isPending}
            />
          ))
        )}
      </div>
    </Modal>
  );
}

// ─── Appearance Card ─────────────────────────────────────────────────────

function AppearanceCard({
  appearance,
  onGenerateImage,
  onSelectImage,
  onConfirmImage,
  onDelete,
  isGenerating,
}: {
  appearance: Appearance;
  onGenerateImage: (index: number) => void;
  onSelectImage: (index: number, selectedIndex: number) => void;
  onConfirmImage: (index: number) => void;
  onDelete: (index: number) => void;
  isGenerating: boolean;
}) {
  const t = useTranslations("assets");
  const candidates: string[] = appearance.candidateImages
    ? JSON.parse(appearance.candidateImages)
    : [];

  return (
    <div className="border border-[var(--color-border-default)] rounded-[var(--radius-md)] p-3">
      <div className="flex items-start gap-3">
        {/* Main image */}
        <div className="w-20 h-20 rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-secondary)] flex-shrink-0">
          {appearance.imageUrl ? (
            <img
              src={appearance.imageUrl}
              alt={`Appearance ${appearance.appearanceIndex}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={20} className="text-[var(--color-text-tertiary)]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              #{appearance.appearanceIndex}
              {appearance.appearanceIndex === 0
                ? ` (${t("primaryAppearance")})`
                : ""}
            </span>
            {appearance.changeReason && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                — {appearance.changeReason}
              </span>
            )}
          </div>
          {appearance.description && (
            <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
              {appearance.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => onGenerateImage(appearance.appearanceIndex)}
              disabled={isGenerating}
              className="cursor-pointer rounded p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-accent-bg)] hover:text-[var(--color-accent)]"
              title={t("generateImage")}
            >
              <Sparkles size={14} />
            </button>
            {appearance.appearanceIndex > 0 && (
              <button
                onClick={() => onDelete(appearance.appearanceIndex)}
                className="cursor-pointer rounded p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)]"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Candidate images */}
      {candidates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border-light)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {t("candidateImages")} ({candidates.length})
            </span>
            {appearance.selectedIndex !== null && (
              <button
                onClick={() => onConfirmImage(appearance.appearanceIndex)}
                className="flex items-center gap-1 text-xs text-[var(--color-success)] hover:text-[var(--color-success)] cursor-pointer"
              >
                <Check size={12} />
                {t("confirmSelection")}
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {candidates.map((url, i) => (
              <button
                key={i}
                onClick={() =>
                  onSelectImage(appearance.appearanceIndex, i)
                }
                className={`relative w-16 h-16 rounded-[var(--radius-md)] overflow-hidden flex-shrink-0 border-2 transition-colors cursor-pointer ${
                  appearance.selectedIndex === i
                    ? "border-[var(--color-accent)]"
                    : "border-transparent hover:border-[var(--color-border-default)]"
                }`}
              >
                <img
                  src={url}
                  alt={`Candidate ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {appearance.selectedIndex === i && (
                  <div className="absolute inset-0 bg-[var(--color-accent)]/20 flex items-center justify-center">
                    <Check size={14} className="text-white drop-shadow" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────

export default function AssetsPage() {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const { status } = useSession();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("characters");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null
  );

  // --- Data queries ---

  const characters = useQuery({
    queryKey: ["asset-characters"],
    queryFn: () =>
      fetch("/api/asset-hub/characters").then((r) => r.json()) as Promise<
        Character[]
      >,
    enabled: status === "authenticated",
  });

  const locations = useQuery({
    queryKey: ["asset-locations"],
    queryFn: () =>
      fetch("/api/asset-hub/locations").then((r) => r.json()) as Promise<
        Location[]
      >,
    enabled: status === "authenticated",
  });

  const voices = useQuery({
    queryKey: ["asset-voices"],
    queryFn: () =>
      fetch("/api/asset-hub/voices").then((r) => r.json()) as Promise<Voice[]>,
    enabled: status === "authenticated",
  });

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      fetch(`/api/asset-hub/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Create failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`asset-${tab}`] });
      setShowCreate(false);
      setName("");
      setDescription("");
      toast.success(tc("success"));
    },
    onError: () => toast.error(tc("error")),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: Tab; id: string }) =>
      fetch(`/api/asset-hub/${type}/${id}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`asset-${vars.type}`] });
      toast.success(tc("success"));
    },
    onError: () => toast.error(tc("error")),
  });

  const generateImageMutation = useMutation({
    mutationFn: ({
      type,
      id,
    }: {
      type: "characters" | "locations";
      id: string;
    }) =>
      fetch(`/api/asset-hub/${type}/${id}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => {
        if (!r.ok) throw new Error("Generate failed");
        return r.json();
      }),
    onSuccess: () => {
      toast.success(t("imageGenerating"));
    },
    onError: () => toast.error(tc("error")),
  });

  // When characters data changes, update selected character if open
  const handleCharacterClick = (char: Character) => {
    setSelectedCharacter(char);
  };

  // Sync selected character with latest data
  const activeCharacter = selectedCharacter
    ? characters.data?.find((c) => c.id === selectedCharacter.id) ?? selectedCharacter
    : null;

  // --- Tabs ---

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    {
      key: "characters",
      icon: <UserIcon size={16} />,
      label: t("characters"),
    },
    { key: "locations", icon: <MapPin size={16} />, label: t("locations") },
    { key: "voices", icon: <Mic size={16} />, label: t("voices") },
  ];

  const currentData =
    tab === "characters" ? characters : tab === "locations" ? locations : voices;

  if (status === "loading" || currentData.isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]" />
        </div>
      </AppShell>
    );
  }

  const items = (currentData.data as (Character | Location | Voice)[]) || [];

  return (
    <AppShell>
      <div className="max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t("title")}</h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} className="mr-1" />
            {t("create")}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--color-border-default)]">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === tb.key
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <Card className="py-12 text-center text-[var(--color-text-secondary)]">
            <ImageIcon size={48} className="mx-auto mb-4 text-[var(--color-text-tertiary)]" />
            <p>{t("empty")}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="flex flex-col">
                {/* Image preview */}
                {"imageUrl" in item && item.imageUrl ? (
                  <div className="relative w-full aspect-square mb-3 rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-secondary)]">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : tab !== "voices" ? (
                  <div className="w-full aspect-square mb-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] flex items-center justify-center">
                    <ImageIcon size={32} className="text-[var(--color-text-tertiary)]" />
                  </div>
                ) : null}

                {/* Info */}
                <h3 className="font-semibold text-[var(--color-text-primary)] truncate">{item.name}</h3>
                {item.description && (
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}

                {/* Character appearance count */}
                {"appearances" in item && (item as Character).appearances.length > 0 && (
                  <div className="mt-1">
                    <Badge>
                      {t("appearanceCount", {
                        count: (item as Character).appearances.length,
                      })}
                    </Badge>
                  </div>
                )}

                {/* Voice-specific info */}
                {"gender" in item && (
                  <div className="flex items-center gap-2 mt-2">
                    {item.gender && <Badge>{item.gender}</Badge>}
                    {item.language && <Badge>{item.language}</Badge>}
                    {"provider" in item && item.provider && (
                      <Badge variant="accent">{item.provider}</Badge>
                    )}
                  </div>
                )}

                {/* Voice binding indicator for characters */}
                {"globalVoiceId" in item &&
                  (item as Character).globalVoiceId && (
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="accent">
                        <Mic size={12} className="mr-1" />
                        {t("voiceBound")}
                      </Badge>
                    </div>
                  )}

                {/* Actions */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--color-border-light)]">
                  {tab === "characters" && (
                    <button
                      onClick={() =>
                        handleCharacterClick(item as Character)
                      }
                      className="cursor-pointer rounded-[var(--radius-md)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)]"
                      title={t("viewDetails")}
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                  {tab !== "voices" && (
                    <button
                      onClick={() =>
                        generateImageMutation.mutate({
                          type: tab as "characters" | "locations",
                          id: item.id,
                        })
                      }
                      disabled={generateImageMutation.isPending}
                      className="cursor-pointer rounded-[var(--radius-md)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-accent-bg)] hover:text-[var(--color-accent)]"
                      title={t("generateImage")}
                    >
                      <Sparkles size={16} />
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      if (confirm(tc("delete") + "?")) {
                        deleteMutation.mutate({ type: tab, id: item.id });
                      }
                    }}
                    className="cursor-pointer rounded-[var(--radius-md)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Modal */}
        <Modal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title={t("create")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ name, description });
            }}
            className="space-y-4"
          >
            <Input
              id="name"
              label={tc("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div>
              <label
                htmlFor="desc"
                className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
              >
                {tc("description")}
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tc("create")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Character Detail Modal */}
        {activeCharacter && (
          <CharacterDetailModal
            character={activeCharacter}
            onClose={() => setSelectedCharacter(null)}
            voices={voices.data || []}
          />
        )}
      </div>
    </AppShell>
  );
}
