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
import {
  Plus,
  Trash2,
  User as UserIcon,
  MapPin,
  Mic,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import toast from "react-hot-toast";

type Tab = "characters" | "locations" | "voices";

interface Character {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  voiceProvider: string | null;
  voiceId: string | null;
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

export default function AssetsPage() {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const { status } = useSession();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("characters");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // --- Data queries ---

  const characters = useQuery({
    queryKey: ["asset-characters"],
    queryFn: () =>
      fetch("/api/asset-hub/characters").then((r) => r.json()) as Promise<Character[]>,
    enabled: status === "authenticated",
  });

  const locations = useQuery({
    queryKey: ["asset-locations"],
    queryFn: () =>
      fetch("/api/asset-hub/locations").then((r) => r.json()) as Promise<Location[]>,
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
    mutationFn: ({ type, id }: { type: "characters" | "locations"; id: string }) =>
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

  // --- Tabs ---

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "characters", icon: <UserIcon size={16} />, label: t("characters") },
    { key: "locations", icon: <MapPin size={16} />, label: t("locations") },
    { key: "voices", icon: <Mic size={16} />, label: t("voices") },
  ];

  const currentData =
    tab === "characters" ? characters : tab === "locations" ? locations : voices;

  if (status === "loading" || currentData.isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} className="mr-1" />
            {t("create")}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tb.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {items.length === 0 ? (
          <Card className="py-12 text-center text-gray-500">
            <ImageIcon size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t("empty")}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="flex flex-col">
                {/* Image preview */}
                {"imageUrl" in item && item.imageUrl ? (
                  <div className="relative w-full aspect-square mb-3 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : tab !== "voices" ? (
                  <div className="w-full aspect-square mb-3 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-300" />
                  </div>
                ) : null}

                {/* Info */}
                <h3 className="font-semibold truncate">{item.name}</h3>
                {item.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}

                {/* Voice-specific info */}
                {"gender" in item && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    {item.gender && <span>{item.gender}</span>}
                    {item.language && <span>{item.language}</span>}
                    {"provider" in item && item.provider && <span>{item.provider}</span>}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {tab !== "voices" && (
                    <button
                      onClick={() =>
                        generateImageMutation.mutate({
                          type: tab as "characters" | "locations",
                          id: item.id,
                        })
                      }
                      disabled={generateImageMutation.isPending}
                      className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
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
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {tc("description")}
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
      </div>
    </AppShell>
  );
}
