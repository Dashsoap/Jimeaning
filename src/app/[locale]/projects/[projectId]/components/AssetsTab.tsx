"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Users,
  MapPin,
  ChevronDown,
  ChevronRight,
  Mic,
  ImageIcon,
} from "lucide-react";
import type { ProjectData, CharacterData, LocationData } from "./types";

interface AssetsTabProps {
  project: ProjectData;
}

export function AssetsTab({ project }: AssetsTabProps) {
  const characters = project.characters || [];
  const locations = project.locations || [];

  if (characters.length === 0 && locations.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="h-12 w-12 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">暂无角色和场景</p>
        <p className="text-sm text-gray-400 mt-1">
          请先在「剧本」标签页粘贴文本并执行 AI 分析
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Characters Section */}
      <CollapsibleSection
        icon={Users}
        title="角色"
        count={characters.length}
        defaultOpen
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.map((char) => (
            <CharacterCard key={char.id} character={char} projectId={project.id} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Locations Section */}
      <CollapsibleSection
        icon={MapPin}
        title="场景"
        count={locations.length}
        defaultOpen
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((loc) => (
            <LocationCard key={loc.id} location={loc} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────────

function CollapsibleSection({
  icon: Icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Icon className="h-4 w-4" />
        <span>{title}</span>
        <span className="text-xs font-normal text-gray-400">({count})</span>
      </button>
      {open && children}
    </div>
  );
}

// ─── Character Card ───────────────────────────────────────────────────────

function CharacterCard({
  character,
  projectId,
}: {
  character: CharacterData;
  projectId: string;
}) {
  const [editingVoice, setEditingVoice] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState(character.voiceProvider || "");
  const [voiceId, setVoiceId] = useState(character.voiceId || "");
  const queryClient = useQueryClient();

  const handleSaveVoice = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceProvider, voiceId }),
      });
      if (!res.ok) throw new Error();
      toast.success("语音配置已保存");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setEditingVoice(false);
    } catch {
      toast.error("保存失败");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Image */}
      {character.imageUrl ? (
        <div className="aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={character.imageUrl}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        </div>
      )}

      {/* Info */}
      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-sm">{character.name}</h3>
        {character.description && (
          <p className="text-xs text-gray-500 line-clamp-2">
            {character.description}
          </p>
        )}

        {/* Voice Config */}
        <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
          {editingVoice ? (
            <div className="space-y-1.5">
              <select
                value={voiceProvider}
                onChange={(e) => setVoiceProvider(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
              >
                <option value="">选择语音供应商</option>
                <option value="openai">OpenAI TTS</option>
                <option value="fish-audio">Fish Audio</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
              <input
                placeholder="Voice ID"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-mono"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSaveVoice}
                  className="flex-1 rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditingVoice(false)}
                  className="flex-1 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingVoice(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Mic className="h-3 w-3" />
              {character.voiceProvider
                ? `${character.voiceProvider} / ${character.voiceId || "default"}`
                : "配置语音"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Location Card ────────────────────────────────────────────────────────

function LocationCard({ location }: { location: LocationData }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {location.imageUrl ? (
        <div className="aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={location.imageUrl}
            alt={location.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        </div>
      )}
      <div className="p-3">
        <h3 className="font-semibold text-sm">{location.name}</h3>
        {location.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-1">
            {location.description}
          </p>
        )}
      </div>
    </div>
  );
}
