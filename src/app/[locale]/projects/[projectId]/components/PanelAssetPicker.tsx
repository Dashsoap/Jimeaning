"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { CharacterData, LocationData } from "./types";

interface PanelAssetPickerProps {
  panelId: string;
  projectId: string;
  characters: CharacterData[];
  locations: LocationData[];
  currentCharacterIds: string[];
  currentLocationId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PanelAssetPicker({
  panelId,
  projectId,
  characters,
  locations,
  currentCharacterIds,
  currentLocationId,
  onClose,
  onSaved,
}: PanelAssetPickerProps) {
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(currentCharacterIds);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(currentLocationId);
  const [saving, setSaving] = useState(false);

  const toggleChar = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/panels/${panelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterIds: selectedCharIds.length > 0 ? JSON.stringify(selectedCharIds) : null,
          locationId: selectedLocId,
        }),
      });
      if (!res.ok) {
        toast.error("保存失败");
        return;
      }
      toast.success("已更新绑定");
      onSaved();
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">绑定资产</h3>
          <button onClick={onClose} className="cursor-pointer">
            <X className="h-4 w-4 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Characters (multi-select) */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">角色（多选）</p>
          <div className="grid grid-cols-4 gap-2">
            {characters.map((c) => {
              const selected = selectedCharIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleChar(c.id)}
                  className={cn(
                    "cursor-pointer flex flex-col items-center gap-1 p-2 rounded-[var(--radius-md)] border-2 transition-all",
                    selected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-border)]",
                  )}
                >
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                      {c.name[0]}
                    </div>
                  )}
                  <span className="text-[10px] text-[var(--color-text-secondary)] truncate max-w-full">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
          {characters.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)] italic">暂无角色</p>
          )}
        </div>

        {/* Locations (single-select) */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">场景（单选）</p>
          <div className="grid grid-cols-3 gap-2">
            {locations.map((l) => {
              const selected = selectedLocId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedLocId(selected ? null : l.id)}
                  className={cn(
                    "cursor-pointer flex flex-col items-center gap-1 p-2 rounded-[var(--radius-md)] border-2 transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-[var(--color-border)] hover:border-[var(--color-border)]",
                  )}
                >
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.imageUrl}
                      alt={l.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                      {l.name[0]}
                    </div>
                  )}
                  <span className="text-[10px] text-[var(--color-text-secondary)] truncate max-w-full">
                    {l.name}
                  </span>
                </button>
              );
            })}
          </div>
          {locations.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)] italic">暂无场景</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-light)]">
          <button
            onClick={onClose}
            className="cursor-pointer px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer px-3 py-1.5 text-xs text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
