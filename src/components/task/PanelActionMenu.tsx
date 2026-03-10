"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Wand2, Camera, Copy, CopyPlus, Trash2 } from "lucide-react";

interface PanelActionMenuProps {
  onModifyPrompt: () => void;
  onAnalyzeShots: () => void;
  onGenerateVariant: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  hasImage: boolean;
}

export function PanelActionMenu({
  onModifyPrompt,
  onAnalyzeShots,
  onGenerateVariant,
  onDuplicate,
  onDelete,
  hasImage,
}: PanelActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
        title="更多操作"
      >
        <MoreVertical className="h-4 w-4 text-white" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-10 w-44 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onModifyPrompt();
            }}
            className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
          >
            <Wand2 className="h-3.5 w-3.5" />
            AI 改写提示词
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onAnalyzeShots();
            }}
            disabled={!hasImage}
            className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Camera className="h-3.5 w-3.5" />
            分析镜头方案
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onGenerateVariant();
            }}
            disabled={!hasImage}
            className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Copy className="h-3.5 w-3.5" />
            生成变体
          </button>

          {(onDuplicate || onDelete) && (
            <div className="my-1 border-t border-[var(--color-border-default)]" />
          )}

          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDuplicate();
              }}
              className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
            >
              <CopyPlus className="h-3.5 w-3.5" />
              复制面板
            </button>
          )}

          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
              className="cursor-pointer flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-bg)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除面板
            </button>
          )}
        </div>
      )}
    </div>
  );
}
