"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, autoMode: boolean) => void;
  t: (key: string) => string;
  tc: (key: string) => string;
}

export function CreateProjectModal({
  open,
  onClose,
  onCreated,
  t,
  tc,
}: CreateProjectModalProps) {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [durationPerEp, setDurationPerEp] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"script" | "novel" | "same">("script");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sourceText.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/agent-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sourceText: sourceText.trim(),
          durationPerEp: durationPerEp.trim() || null,
          autoMode,
          outputFormat,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTitle("");
      setSourceText("");
      setDurationPerEp("");
      setAutoMode(false);
      setOutputFormat("script");
      onCreated(data.id, autoMode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("createProject")} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="title"
          label={t("projectTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
            {t("sourceText")}
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t("sourceTextPlaceholder")}
            rows={10}
            required
            className="flex w-full rounded-[var(--radius-lg)] border border-transparent bg-[var(--color-bg-surface)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[rgba(245,166,35,0.3)] focus:border-[var(--color-border-default)] transition-colors resize-y"
          />
          {sourceText.length > 0 && (
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {sourceText.length.toLocaleString()} 字
            </p>
          )}
        </div>
        {/* Output format selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
            {t("outputFormat")}
          </label>
          <div className="flex gap-2">
            {(["script", "novel", "same"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setOutputFormat(fmt)}
                className={`flex-1 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  outputFormat === fmt
                    ? "bg-[var(--color-btn-primary)] text-white"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-hover)]"
                }`}
              >
                {t(`format_${fmt}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
            {t(`formatHint_${outputFormat}`)}
          </p>
        </div>
        {outputFormat === "script" && (
          <Input
            id="duration"
            label={t("durationPerEp")}
            value={durationPerEp}
            onChange={(e) => setDurationPerEp(e.target.value)}
            placeholder={t("durationHint")}
          />
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">{t("autoMode")}</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">— {t("autoModeHint")}</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={submitting || !title.trim() || !sourceText.trim()}>
            {submitting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            {tc("create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
