"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskTextStream } from "@/hooks/useTaskTextStream";
import { Upload, FileVideo, FileAudio, Image as ImageIcon, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

interface ScriptAnalysis {
  scenes: { number: number; description: string; timestamp: string; emotion: string }[];
  characters: { name: string; description: string; relationship: string }[];
  plotElements: { name: string; category: string; description: string; tags: string[] }[];
  narrativeStructure: { hook: string; conflict: string; climax: string; resolution: string };
}

interface ReverseScriptDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ACCEPTED_TYPES = [
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/flac",
  "image/jpeg", "image/png", "image/gif", "image/webp",
];

type DialogPhase = "input" | "streaming" | "result";

export function ReverseScriptDialog({ open, onClose, onSuccess }: ReverseScriptDialogProps) {
  const t = useTranslations("scripts");
  const tc = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [analysisData, setAnalysisData] = useState<ScriptAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    scenes: true,
    characters: true,
    plotElements: false,
    narrative: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  const {
    streamedText,
    isStreaming,
    isComplete,
    isFailed,
    error,
    taskResult,
    progressPercent,
  } = useTaskTextStream(taskId);

  // Determine dialog phase
  const phase: DialogPhase = taskId
    ? isComplete
      ? "result"
      : "streaming"
    : "input";

  // Auto-scroll during streaming
  useEffect(() => {
    if (phase === "streaming" && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamedText, phase]);

  // When complete, fetch full script from API (more reliable than streamed text)
  useEffect(() => {
    const scriptId = taskResult?.scriptId as string | undefined;
    if (!scriptId) return;
    setAnalysisLoading(true);
    fetch(`/api/scripts/${scriptId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          // Use saved content from DB — complete, unlike streamed chunks which may be partial
          const fullText = data.title && data.content
            ? `${data.title}\n\n${data.content}`
            : data.content || streamedText;
          setEditedText(fullText);
          setOriginalText(fullText);
          if (data.analysisData) {
            setAnalysisData(data.analysisData as ScriptAnalysis);
          }
        } else {
          setEditedText(streamedText);
          setOriginalText(streamedText);
        }
      })
      .catch(() => {
        setEditedText(streamedText);
        setOriginalText(streamedText);
      })
      .finally(() => setAnalysisLoading(false));
  }, [taskResult, streamedText]);

  // Handle failure
  useEffect(() => {
    if (isFailed && error) {
      toast.error(error);
      setTaskId(null);
    }
  }, [isFailed, error]);

  const resetAndClose = () => {
    setFile(null);
    setCustomPrompt("");
    setTaskId(null);
    setUploading(false);
    setEditedText("");
    setOriginalText("");
    setAnalysisData(null);
    setAnalysisLoading(false);
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      toast.error(t("unsupportedFileType"));
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      toast.error(t("fileTooLarge"));
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleSubmit = async () => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (customPrompt.trim()) {
        formData.append("customPrompt", customPrompt.trim());
      }

      const res = await fetch("/api/scripts/reverse", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tc("error"));
        setUploading(false);
        return;
      }

      setTaskId(data.taskId);
    } catch {
      toast.error(tc("error"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const scriptId = taskResult?.scriptId as string | undefined;
    if (!scriptId) return;

    // If user edited the text, update the script
    if (editedText !== originalText) {
      const lines = editedText.trim().split("\n");
      const title = lines[0].replace(/^[#\s*]+/, "").trim() || "倒推剧本";
      const content = lines.slice(1).join("\n").trim() || editedText.trim();

      try {
        await fetch(`/api/scripts/${scriptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        });
      } catch {
        toast.error(tc("error"));
        return;
      }
    }

    toast.success(t("reverseSuccess"));
    onSuccess();
    resetAndClose();
  };

  const handleDiscard = async () => {
    const scriptId = taskResult?.scriptId as string | undefined;
    if (scriptId) {
      try {
        await fetch(`/api/scripts/${scriptId}`, { method: "DELETE" });
      } catch {
        // ignore
      }
    }
    resetAndClose();
  };

  const getFileIcon = () => {
    if (!file) return null;
    if (file.type.startsWith("video/")) return <FileVideo size={40} className="text-[var(--color-accent)]" />;
    if (file.type.startsWith("audio/")) return <FileAudio size={40} className="text-[var(--color-success)]" />;
    return <ImageIcon size={40} className="text-purple-500" />;
  };

  const isBusy = uploading || isStreaming;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Modal
      open={open}
      onClose={isBusy ? () => {} : (phase === "result" ? handleDiscard : resetAndClose)}
      title={t("reverseScript")}
      className={phase === "result" ? "max-w-4xl" : "max-w-2xl"}
    >
      <div className="space-y-4">
        {/* Phase: Input */}
        {phase === "input" && (
          <>
            {/* File upload area */}
            {!file ? (
              <div
                className="flex flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border-default)] p-8 cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload size={36} className="text-[var(--color-text-tertiary)] mb-3" />
                <p className="text-sm text-[var(--color-text-secondary)]">{t("uploadHint")}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{t("supportedFormats")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={ACCEPTED_TYPES.join(",")}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
                {getFileIcon()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)] cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Custom prompt */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {t("customPrompt")}
              </label>
              <textarea
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                rows={2}
                placeholder={t("customPromptPlaceholder")}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={resetAndClose}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={!file || uploading}>
                {uploading ? t("uploading") : t("startReverse")}
              </Button>
            </div>
          </>
        )}

        {/* Phase: Streaming */}
        {phase === "streaming" && (
          <>
            <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
              <Loader2 size={16} className="animate-spin" />
              <span>{t("analyzing")}... {progressPercent > 0 ? `${progressPercent}%` : ""}</span>
            </div>
            <div
              ref={streamRef}
              className="max-h-96 overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4 text-sm whitespace-pre-wrap font-mono"
            >
              {streamedText}
              <span className="inline-block w-0.5 h-4 bg-[var(--color-accent)] animate-pulse ml-0.5 align-text-bottom" />
            </div>
            {progressPercent > 0 && (
              <div className="h-1.5 rounded-full bg-[var(--color-bg-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </>
        )}

        {/* Phase: Result */}
        {phase === "result" && (
          <>
            {/* Structured Analysis */}
            {analysisLoading && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
                <Loader2 size={16} className="animate-spin" />
                <span>{t("analyzingStructure")}</span>
              </div>
            )}
            {analysisData && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {/* Narrative Structure */}
                {analysisData.narrativeStructure && (
                  <AnalysisSection
                    title={t("analysisNarrative")}
                    expanded={expandedSections.narrative}
                    onToggle={() => toggleSection("narrative")}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {(["hook", "conflict", "climax", "resolution"] as const).map((key) => (
                        <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-2">
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                            {t(`narrative${key.charAt(0).toUpperCase() + key.slice(1)}` as "narrativeHook")}
                          </p>
                          <p className="text-sm mt-0.5">{analysisData.narrativeStructure[key] || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </AnalysisSection>
                )}

                {/* Scenes */}
                {analysisData.scenes?.length > 0 && (
                  <AnalysisSection
                    title={t("analysisScenes")}
                    count={analysisData.scenes.length}
                    expanded={expandedSections.scenes}
                    onToggle={() => toggleSection("scenes")}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-[var(--color-text-secondary)]">
                            <th className="pb-1 pr-3">#</th>
                            <th className="pb-1 pr-3">{tc("description")}</th>
                            <th className="pb-1 pr-3">{t("sceneTimestamp")}</th>
                            <th className="pb-1">{t("sceneEmotion")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border-light)]">
                          {analysisData.scenes.map((scene, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-3 text-[var(--color-text-tertiary)]">{scene.number}</td>
                              <td className="py-1 pr-3">{scene.description}</td>
                              <td className="py-1 pr-3 text-xs text-[var(--color-text-secondary)]">{scene.timestamp}</td>
                              <td className="py-1 text-xs">
                                <span className="rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-[var(--color-accent)]">
                                  {scene.emotion}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AnalysisSection>
                )}

                {/* Characters */}
                {analysisData.characters?.length > 0 && (
                  <AnalysisSection
                    title={t("analysisCharacters")}
                    count={analysisData.characters.length}
                    expanded={expandedSections.characters}
                    onToggle={() => toggleSection("characters")}
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      {analysisData.characters.map((char, i) => (
                        <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-2">
                          <p className="text-sm font-medium">{char.name}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{char.description}</p>
                          {char.relationship && (
                            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                              <span className="font-medium">{t("characterRelationship")}:</span> {char.relationship}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </AnalysisSection>
                )}

                {/* Plot Elements */}
                {analysisData.plotElements?.length > 0 && (
                  <AnalysisSection
                    title={t("analysisPlotElements")}
                    count={analysisData.plotElements.length}
                    expanded={expandedSections.plotElements}
                    onToggle={() => toggleSection("plotElements")}
                  >
                    <div className="space-y-1.5">
                      {analysisData.plotElements.map((elem, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                            {elem.category}
                          </span>
                          <div>
                            <span className="font-medium">{elem.name}</span>
                            <span className="text-[var(--color-text-secondary)] ml-1">{elem.description}</span>
                            {elem.tags?.length > 0 && (
                              <span className="ml-2">
                                {elem.tags.map((tag, j) => (
                                  <span key={j} className="mr-1 text-xs text-[var(--color-accent)]">#{tag}</span>
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AnalysisSection>
                )}
              </div>
            )}

            {/* Editable script text */}
            <textarea
              className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              rows={12}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleDiscard}>
                {t("discard")}
              </Button>
              <Button onClick={handleSave}>
                {t("saveScript")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function AnalysisSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-[var(--color-bg-secondary)] cursor-pointer"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {count !== undefined && (
          <span className="text-xs text-[var(--color-text-tertiary)]">({count})</span>
        )}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
