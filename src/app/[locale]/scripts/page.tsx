"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CreateScriptDialog } from "./components/CreateScriptDialog";
import { ReverseScriptDialog } from "./components/ReverseScriptDialog";
import { RewriteScriptDialog } from "./components/RewriteScriptDialog";
import {
  Plus,
  Trash2,
  FileText,
  Upload,
  RefreshCw,
  FolderPlus,
  Pencil,
  Eye,
  X,
  Search,
  MoreHorizontal,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalysisData = Record<string, any>;

interface Script {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  sourceMedia: string | null;
  parentId: string | null;
  masterScriptId: string | null;
  chapterIndex: number | null;
  chapterSummary: string | null;
  analysisData?: AnalysisData | null;
  _count?: { chapters: number };
  createdAt: string;
  updatedAt: string;
}

type SourceFilter = "all" | "manual" | "reverse" | "rewrite" | "import";

type BadgeVariant = "default" | "accent" | "success" | "danger" | "warning" | "info";

const SOURCE_TYPE_BADGE: Record<string, { variant: BadgeVariant }> = {
  manual: { variant: "default" },
  reverse: { variant: "info" },
  rewrite: { variant: "accent" },
  import: { variant: "success" },
  chapter: { variant: "warning" },
};

export default function ScriptsPage() {
  const t = useTranslations("scripts");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "zh";
  const { status } = useSession();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);
  const [expandedMasterIds, setExpandedMasterIds] = useState<Set<string>>(new Set());
  const [rewritePreSelectedId, setRewritePreSelectedId] = useState<string | undefined>();
  const [viewScript, setViewScript] = useState<Script | null>(null);
  const [viewAnalysis, setViewAnalysis] = useState<AnalysisData | null>(null);
  const [viewAnalysisLoading, setViewAnalysisLoading] = useState(false);
  const [viewExpandedSections, setViewExpandedSections] = useState<Record<string, boolean>>({
    technicalSummary: true, scenes: true, shots: true, characters: true, plotElements: false, narrative: true,
  });
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch analysisData when viewing a reverse-type script
  useEffect(() => {
    if (!viewScript) { setViewAnalysis(null); return; }
    if (viewScript.sourceType !== "reverse") return;
    if (viewScript.analysisData) { setViewAnalysis(viewScript.analysisData); return; }
    setViewAnalysisLoading(true);
    fetch(`/api/scripts/${viewScript.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.analysisData) setViewAnalysis(data.analysisData); })
      .catch(() => {})
      .finally(() => setViewAnalysisLoading(false));
  }, [viewScript]);

  const { data: scripts = [], isLoading } = useQuery<Script[]>({
    queryKey: ["scripts"],
    queryFn: () => fetch("/api/scripts").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  const chapterIds = useMemo(
    () => new Set(scripts.filter((s) => s.sourceType === "chapter").map((s) => s.id)),
    [scripts],
  );

  const filteredScripts = useMemo(() => {
    let result = scripts.filter(
      (s) => s.sourceType !== "chapter" && !(s.parentId && chapterIds.has(s.parentId)),
    );
    if (sourceFilter !== "all") {
      result = result.filter((s) => s.sourceType === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [scripts, sourceFilter, searchQuery, chapterIds]);

  const getChapters = useCallback(
    (masterScriptId: string) =>
      scripts
        .filter((s) => s.masterScriptId === masterScriptId && s.sourceType === "chapter")
        .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0)),
    [scripts],
  );

  const getChapterRewrites = useCallback(
    (chapterId: string) =>
      scripts.filter((s) => s.parentId === chapterId && s.sourceType === "rewrite"),
    [scripts],
  );

  const toggleExpand = (id: string) => {
    setExpandedMasterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setShowCreate(false);
      toast.success(tc("success"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; title: string; content: string }) =>
      fetch(`/api/scripts/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.title, content: data.content }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setEditScript(null);
      toast.success(tc("success"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/scripts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      toast.success(tc("success"));
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (scriptId: string) => {
      const r = await fetch(`/api/scripts/${scriptId}/create-project`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw { status: r.status, ...data };
      return data;
    },
    onSuccess: (data) => {
      toast.success(tc("success"));
      router.push(`/${locale}/projects/${data.projectId}`);
    },
    onError: (err: { status?: number; projectId?: string; error?: string }) => {
      if (err.status === 409 && err.projectId) {
        toast.error(t("projectAlreadyExists"));
        router.push(`/${locale}/projects/${err.projectId}`);
      } else {
        toast.error(tc("error"));
      }
    },
  });

  const refreshScripts = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts"] });
  };

  const sourceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      manual: t("sourceManual"),
      reverse: t("sourceReverse"),
      rewrite: t("sourceRewrite"),
      import: t("sourceImport"),
      chapter: t("sourceChapter"),
    };
    return labels[type] || labels.manual;
  };

  const sourceTypeBadgeVariant = (type: string): BadgeVariant => {
    return (SOURCE_TYPE_BADGE[type] || SOURCE_TYPE_BADGE.manual).variant;
  };

  const filterTabs: { key: SourceFilter; label: string }[] = [
    { key: "all", label: t("allTypes") },
    { key: "manual", label: t("sourceManual") },
    { key: "reverse", label: t("sourceReverse") },
    { key: "rewrite", label: t("sourceRewrite") },
    { key: "import", label: t("sourceImport") },
  ];

  if (status === "loading" || isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t("title")}</h1>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowReverse(true)} title={t("reverseScriptDesc")}>
              <Upload size={18} className="mr-1" />
              {t("reverseScript")}
            </Button>
            <Button variant="ghost" onClick={() => { setRewritePreSelectedId(undefined); setShowRewrite(true); }} title={t("rewriteScriptDesc")}>
              <RefreshCw size={18} className="mr-1" />
              {t("rewriteScript")}
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/${locale}/scripts/smart-import`)} title={t("smartImportDesc")}>
              <BookOpen size={18} className="mr-1" />
              {t("smartImport")}
            </Button>
            <Button onClick={() => setShowCreate(true)} title={t("createScriptDesc")}>
              <Plus size={18} className="mr-1" />
              {t("createScript")}
            </Button>
          </div>
        </div>

        {/* Search + Filter */}
        {scripts.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border-default)] overflow-hidden shrink-0">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    sourceFilter === tab.key
                      ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)]"
                  }`}
                  onClick={() => setSourceFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {!scripts.length ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] py-16 text-center">
            <FileText size={48} className="mx-auto mb-4 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)] mb-1">{t("noScripts")}</p>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-6">{t("emptyStateHint")}</p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => setShowReverse(true)} title={t("reverseScriptDesc")}>
                <Upload size={16} className="mr-1" />
                {t("reverseScript")}
              </Button>
              <Button onClick={() => setShowCreate(true)} title={t("createScriptDesc")}>
                <Plus size={16} className="mr-1" />
                {t("createScript")}
              </Button>
            </div>
          </div>
        ) : filteredScripts.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] py-16 text-center">
            <Search size={36} className="mx-auto mb-3 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)]">{t("noScripts")}</p>
          </div>
        ) : (
          <div className="grid gap-4" ref={menuRef}>
            {filteredScripts.map((s) => {
              const isImport = s.sourceType === "import";
              const chapterList = isImport ? getChapters(s.id) : [];
              const isExpanded = expandedMasterIds.has(s.id);

              return (
                <div key={s.id}>
                  <Card className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isImport && chapterList.length > 0 && (
                          <button
                            onClick={() => toggleExpand(s.id)}
                            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        <h3 className="font-semibold text-[var(--color-text-primary)] truncate">{s.title}</h3>
                        <Badge variant={sourceTypeBadgeVariant(s.sourceType)}>
                          {sourceTypeLabel(s.sourceType)}
                        </Badge>
                        {isImport && chapterList.length > 0 && (
                          <Badge>{chapterList.length} {t("chaptersCount")}</Badge>
                        )}
                      </div>
                      {isImport ? (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mt-1">
                            {s.content.slice(0, 200)}
                          </p>
                          <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="secondary"
                        onClick={() => createProjectMutation.mutate(s.id)}
                        disabled={createProjectMutation.isPending}
                        className="text-xs px-3 py-1.5 h-auto"
                        title={t("createProjectDesc")}
                      >
                        <FolderPlus size={14} className="mr-1" />
                        {t("createProject")}
                      </Button>

                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                          className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-secondary)] cursor-pointer"
                          title={t("moreActions")}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === s.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white py-1 shadow-lg">
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                              onClick={() => { setViewScript(s); setOpenMenuId(null); }}
                            >
                              <Eye size={14} />
                              {t("view")}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                              onClick={() => {
                                setEditScript(s);
                                setTitle(s.title);
                                setContent(s.content);
                                setOpenMenuId(null);
                              }}
                            >
                              <Pencil size={14} />
                              {tc("edit")}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                              onClick={() => {
                                setRewritePreSelectedId(s.id);
                                setShowRewrite(true);
                                setOpenMenuId(null);
                              }}
                            >
                              <RefreshCw size={14} />
                              {t("rewriteScript")}
                            </button>
                            <hr className="my-1 border-[var(--color-border-light)]" />
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-bg)] cursor-pointer"
                              onClick={() => {
                                setOpenMenuId(null);
                                if (confirm(tc("confirm") + "?")) {
                                  deleteMutation.mutate(s.id);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                              {tc("delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* Expanded chapters */}
                  {isExpanded && chapterList.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1">
                      {chapterList.map((ch) => {
                        const rewrites = getChapterRewrites(ch.id);
                        return (
                          <div key={ch.id}>
                            <Card className="flex items-center justify-between gap-3 py-2 px-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[var(--color-text-tertiary)] font-mono">#{ch.chapterIndex}</span>
                                  <span className="text-sm font-medium truncate text-[var(--color-text-primary)]">{ch.title}</span>
                                  <Badge variant={sourceTypeBadgeVariant(ch.sourceType)}>
                                    {sourceTypeLabel(ch.sourceType)}
                                  </Badge>
                                </div>
                                {ch.chapterSummary && (
                                  <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-1 mt-0.5">{ch.chapterSummary}</p>
                                )}
                              </div>
                            </Card>
                            {rewrites.map((rw) => (
                              <Card key={rw.id} className="flex items-center justify-between gap-3 py-2 px-3 ml-6 mt-1 border-l-2 border-[var(--color-accent-bg)]">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <RefreshCw size={12} className="text-[var(--color-accent)] shrink-0" />
                                    <span className="text-sm font-medium truncate text-[var(--color-text-primary)]">{rw.title}</span>
                                    <Badge variant={sourceTypeBadgeVariant(rw.sourceType)}>
                                      {sourceTypeLabel(rw.sourceType)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-1 mt-0.5 ml-5">{rw.content.slice(0, 100)}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setViewScript(rw)}
                                    className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-secondary)] cursor-pointer"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => createProjectMutation.mutate(rw.id)}
                                    disabled={createProjectMutation.isPending}
                                    className="text-xs px-2 py-1 h-auto"
                                  >
                                    <FolderPlus size={12} className="mr-1" />
                                    {t("createProject")}
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create Script Dialog */}
        <CreateScriptDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />

        {/* Edit Script Modal */}
        <Modal open={!!editScript} onClose={() => setEditScript(null)} title={tc("edit")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editScript) {
                updateMutation.mutate({ id: editScript.id, title, content });
              }
            }}
            className="space-y-5"
          >
            <Input
              id="edit-title"
              label={t("scriptTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div>
              <label htmlFor="edit-content" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {t("scriptContent")}
              </label>
              <textarea
                id="edit-content"
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditScript(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {tc("save")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* View Script Modal */}
        <Modal open={!!viewScript} onClose={() => setViewScript(null)} title={viewScript?.title} className={viewAnalysis ? "max-w-5xl" : "max-w-2xl"}>
          {viewScript && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={sourceTypeBadgeVariant(viewScript.sourceType)}>
                  {sourceTypeLabel(viewScript.sourceType)}
                </Badge>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {new Date(viewScript.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Analysis Data (reverse scripts) */}
              {viewAnalysisLoading && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
                  <span className="animate-spin">⏳</span>
                  <span>加载分析数据...</span>
                </div>
              )}
              {viewAnalysis && (
                <ScriptAnalysisView
                  data={viewAnalysis}
                  expandedSections={viewExpandedSections}
                  onToggle={(key) => setViewExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
              )}

              <div className="max-h-96 overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4 text-sm whitespace-pre-wrap text-[var(--color-text-primary)]">
                {viewScript.content}
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setViewScript(null)}>
                  <X size={16} className="mr-1" />
                  {t("close")}
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Reverse Script Dialog */}
        <ReverseScriptDialog open={showReverse} onClose={() => setShowReverse(false)} onSuccess={refreshScripts} />

        {/* Rewrite Script Dialog */}
        <RewriteScriptDialog
          open={showRewrite}
          onClose={() => setShowRewrite(false)}
          onSuccess={refreshScripts}
          scripts={scripts}
          preSelectedId={rewritePreSelectedId}
        />
      </div>
    </AppShell>
  );
}

// ── Reusable analysis rendering for reverse scripts ──

const ROLE_COLORS: Record<string, string> = {
  protagonist: "bg-blue-100 text-blue-700", antagonist: "bg-red-100 text-red-700",
  supporting: "bg-amber-100 text-amber-700", minor: "bg-gray-100 text-gray-600",
};
const ROLE_LABELS: Record<string, string> = {
  protagonist: "主角", antagonist: "反派", supporting: "配角", minor: "龙套",
};
const CATEGORY_COLORS: Record<string, string> = {
  plotDevice: "bg-violet-100 text-violet-700", character: "bg-pink-100 text-pink-700",
  narrative: "bg-blue-100 text-blue-700", setting: "bg-emerald-100 text-emerald-700",
  symbol: "bg-amber-100 text-amber-700", prop: "bg-cyan-100 text-cyan-700",
  event: "bg-orange-100 text-orange-700",
};

function ExpandableSection({ title, count, expanded, onToggle, children }: {
  title: string; count?: number; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-[var(--color-bg-secondary)] cursor-pointer">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {count !== undefined && <span className="text-xs text-[var(--color-text-tertiary)]">({count})</span>}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function ScriptAnalysisView({ data, expandedSections, onToggle }: {
  data: AnalysisData; expandedSections: Record<string, boolean>; onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {/* Technical Summary */}
      {data.technicalSummary && (
        <ExpandableSection title="技术概览" expanded={expandedSections.technicalSummary} onToggle={() => onToggle("technicalSummary")}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "总镜头数", value: data.technicalSummary.totalShots },
              { label: "预估时长", value: data.technicalSummary.estimatedDuration },
              { label: "主要景别", value: data.technicalSummary.dominantFraming },
              { label: "主要运镜", value: data.technicalSummary.dominantMovement },
              { label: "BGM变化", value: `${data.technicalSummary.bgmChanges ?? 0}次` },
              { label: "对话占比", value: data.technicalSummary.dialogueRatio },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-2 text-center">
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{item.label}</p>
                <p className="text-sm font-medium mt-0.5">{item.value || "—"}</p>
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Narrative Structure */}
      {data.narrativeStructure && (
        <ExpandableSection title="叙事结构" expanded={expandedSections.narrative} onToggle={() => onToggle("narrative")}>
          <div className="grid grid-cols-2 gap-2">
            {(["hook", "conflict", "climax", "resolution"] as const).map((key) => (
              <div key={key} className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-2">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {{ hook: "开场钩子", conflict: "核心冲突", climax: "高潮", resolution: "结局" }[key]}
                </p>
                <p className="text-sm mt-0.5">{data.narrativeStructure[key] || "—"}</p>
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Scenes */}
      {data.scenes?.length > 0 && (
        <ExpandableSection title="场景" count={data.scenes.length} expanded={expandedSections.scenes} onToggle={() => onToggle("scenes")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-secondary)]">
                  <th className="pb-1 pr-3">#</th><th className="pb-1 pr-3">描述</th>
                  <th className="pb-1 pr-3">时间</th><th className="pb-1">情绪</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-light)]">
                {data.scenes.map((scene: AnalysisData, i: number) => (
                  <tr key={i}>
                    <td className="py-1 pr-3 text-[var(--color-text-tertiary)]">{scene.number}</td>
                    <td className="py-1 pr-3">{scene.description}</td>
                    <td className="py-1 pr-3 text-xs text-[var(--color-text-secondary)]">{scene.timestamp}</td>
                    <td className="py-1 text-xs">
                      <span className="rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-[var(--color-accent)]">{scene.emotion}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExpandableSection>
      )}

      {/* Shots */}
      {data.shots?.length > 0 && (
        <ExpandableSection title="分镜头" count={data.shots.length} expanded={expandedSections.shots} onToggle={() => onToggle("shots")}>
          <div className="space-y-2">
            {data.shots.map((shot: AnalysisData, i: number) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border-light)] p-2 text-xs">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-medium text-sm">镜头 {shot.number}</span>
                  <span className="text-[var(--color-text-tertiary)]">{shot.timestamp}</span>
                  <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-[var(--color-text-secondary)]">{shot.duration}s</span>
                  {shot.emotion && <span className="rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-[var(--color-accent)]">{shot.emotion}</span>}
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[var(--color-text-secondary)]">
                  <div><span className="font-medium">景别:</span> {shot.framing}</div>
                  <div><span className="font-medium">角度:</span> {shot.angle}</div>
                  <div><span className="font-medium">运镜:</span> {shot.movement}</div>
                </div>
                <p className="mt-1.5 text-[var(--color-text-primary)]">{shot.content}</p>
                {shot.dialogue && <p className="mt-1 text-[var(--color-text-secondary)]"><span className="font-medium">对话:</span> {shot.dialogue}</p>}
                <div className="flex gap-3 mt-1 text-[var(--color-text-tertiary)]">
                  {shot.sfx && <span>音效: {shot.sfx}</span>}
                  {shot.bgm && <span>BGM: {shot.bgm}</span>}
                </div>
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Characters */}
      {data.characters?.length > 0 && (
        <ExpandableSection title="角色" count={data.characters.length} expanded={expandedSections.characters} onToggle={() => onToggle("characters")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.characters.map((char: AnalysisData, i: number) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{char.name}</p>
                  {char.role && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[char.role] || "bg-gray-100 text-gray-600"}`}>
                      {ROLE_LABELS[char.role] || char.role}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{char.description}</p>
                {char.relationship && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5"><span className="font-medium">关系:</span> {char.relationship}</p>}
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Plot Elements */}
      {data.plotElements?.length > 0 && (
        <ExpandableSection title="叙事元素" count={data.plotElements.length} expanded={expandedSections.plotElements} onToggle={() => onToggle("plotElements")}>
          <div className="space-y-2">
            {data.plotElements.map((elem: AnalysisData, i: number) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border-light)] p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[elem.category] || "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"}`}>
                    {elem.category}
                  </span>
                  <span className="text-sm font-medium">{elem.name}</span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mb-1.5">{elem.description}</p>
                {elem.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {elem.tags.map((tag: string, j: number) => (
                      <span key={j} className="rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] font-medium">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}
    </div>
  );
}
