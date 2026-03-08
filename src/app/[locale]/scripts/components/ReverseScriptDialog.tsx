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
    if (file.type.startsWith("video/")) return <FileVideo size={40} className="text-blue-500" />;
    if (file.type.startsWith("audio/")) return <FileAudio size={40} className="text-green-500" />;
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
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/10"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload size={36} className="text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("uploadHint")}</p>
                <p className="text-xs text-gray-400 mt-1">{t("supportedFormats")}</p>
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
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {getFileIcon()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Custom prompt */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("customPrompt")}
              </label>
              <textarea
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" />
              <span>{t("analyzing")}... {progressPercent > 0 ? `${progressPercent}%` : ""}</span>
            </div>
            <div
              ref={streamRef}
              className="max-h-96 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap font-mono dark:bg-gray-800"
            >
              {streamedText}
              <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
            </div>
            {progressPercent > 0 && (
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
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
              <div className="flex items-center gap-2 text-sm text-blue-600">
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
                        <div key={key} className="rounded-md bg-gray-50 p-2 dark:bg-gray-800">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
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
                          <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                            <th className="pb-1 pr-3">#</th>
                            <th className="pb-1 pr-3">{tc("description")}</th>
                            <th className="pb-1 pr-3">{t("sceneTimestamp")}</th>
                            <th className="pb-1">{t("sceneEmotion")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {analysisData.scenes.map((scene, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-3 text-gray-400">{scene.number}</td>
                              <td className="py-1 pr-3">{scene.description}</td>
                              <td className="py-1 pr-3 text-xs text-gray-500">{scene.timestamp}</td>
                              <td className="py-1 text-xs">
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
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
                        <div key={i} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                          <p className="text-sm font-medium">{char.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{char.description}</p>
                          {char.relationship && (
                            <p className="text-xs text-gray-400 mt-0.5">
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
                          <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {elem.category}
                          </span>
                          <div>
                            <span className="font-medium">{elem.name}</span>
                            <span className="text-gray-500 ml-1">{elem.description}</span>
                            {elem.tags?.length > 0 && (
                              <span className="ml-2">
                                {elem.tags.map((tag, j) => (
                                  <span key={j} className="mr-1 text-xs text-blue-500">#{tag}</span>
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
              className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {count !== undefined && (
          <span className="text-xs text-gray-400">({count})</span>
        )}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
