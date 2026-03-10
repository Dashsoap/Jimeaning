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
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">绑定资产</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Characters (multi-select) */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">角色（多选）</p>
          <div className="grid grid-cols-4 gap-2">
            {characters.map((c) => {
              const selected = selectedCharIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleChar(c.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                    selected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300",
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
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {c.name[0]}
                    </div>
                  )}
                  <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-full">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
          {characters.length === 0 && (
            <p className="text-xs text-gray-400 italic">暂无角色</p>
          )}
        </div>

        {/* Locations (single-select) */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">场景（单选）</p>
          <div className="grid grid-cols-3 gap-2">
            {locations.map((l) => {
              const selected = selectedLocId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedLocId(selected ? null : l.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                    selected
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300",
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
                    <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {l.name[0]}
                    </div>
                  )}
                  <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-full">
                    {l.name}
                  </span>
                </button>
              );
            })}
          </div>
          {locations.length === 0 && (
            <p className="text-xs text-gray-400 italic">暂无场景</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
