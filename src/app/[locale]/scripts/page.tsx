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
import { CreateScriptDialog } from "./components/CreateScriptDialog";
import { ReverseScriptDialog } from "./components/ReverseScriptDialog";
import { RewriteScriptDialog } from "./components/RewriteScriptDialog";
// SmartImportDialog removed — now a full page at /scripts/smart-import
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
} from "lucide-react";
import toast from "react-hot-toast";

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
  _count?: { chapters: number };
  createdAt: string;
  updatedAt: string;
}

type SourceFilter = "all" | "manual" | "reverse" | "rewrite" | "import";

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
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: scripts = [], isLoading } = useQuery<Script[]>({
    queryKey: ["scripts"],
    queryFn: () => fetch("/api/scripts").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  // Build a set of chapter IDs so we can hide their child rewrites from top-level
  const chapterIds = useMemo(
    () => new Set(scripts.filter((s) => s.sourceType === "chapter").map((s) => s.id)),
    [scripts],
  );

  const filteredScripts = useMemo(() => {
    // Hide chapter scripts and their child rewrites from top-level list
    let result = scripts.filter(
      (s) => s.sourceType !== "chapter" && !(s.parentId && chapterIds.has(s.parentId)),
    );
    if (sourceFilter !== "all") {
      result = result.filter((s) => s.sourceType === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [scripts, sourceFilter, searchQuery, chapterIds]);

  // Get chapter scripts for a given master, with their rewrites attached
  const getChapters = useCallback(
    (masterScriptId: string) =>
      scripts
        .filter((s) => s.masterScriptId === masterScriptId && s.sourceType === "chapter")
        .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0)),
    [scripts],
  );

  // Get rewrite scripts for a given chapter
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
    mutationFn: (id: string) =>
      fetch(`/api/scripts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      toast.success(tc("success"));
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: (scriptId: string) =>
      fetch(`/api/scripts/${scriptId}/create-project`, { method: "POST" }).then(
        (r) => r.json()
      ),
    onSuccess: (data) => {
      toast.success(tc("success"));
      router.push(`/${locale}/projects/${data.projectId}`);
    },
    onError: () => {
      toast.error(tc("error"));
    },
  });

  const refreshScripts = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts"] });
  };

  const sourceTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      manual: { text: t("sourceManual"), color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
      reverse: { text: t("sourceReverse"), color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
      rewrite: { text: t("sourceRewrite"), color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
      import: { text: t("sourceImport"), color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
      chapter: { text: t("sourceChapter"), color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
    };
    return labels[type] || labels.manual;
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
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
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    sourceFilter === tab.key
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
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
          /* Empty state with guidance */
          <Card className="py-12 text-center">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 mb-1">{t("noScripts")}</p>
            <p className="text-sm text-gray-400 mb-6">{t("emptyStateHint")}</p>
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
          </Card>
        ) : filteredScripts.length === 0 ? (
          <Card className="py-12 text-center text-gray-500">
            <Search size={36} className="mx-auto mb-3 text-gray-300" />
            <p>{t("noScripts")}</p>
          </Card>
        ) : (
          <div className="grid gap-4" ref={menuRef}>
            {filteredScripts.map((s) => {
              const label = sourceTypeLabel(s.sourceType);
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
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        <h3 className="font-semibold truncate">{s.title}</h3>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${label.color}`}>
                          {label.text}
                        </span>
                        {isImport && chapterList.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {chapterList.length} {t("chaptersCount")}
                          </span>
                        )}
                      </div>
                      {isImport ? (
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                            {s.content.slice(0, 200)}
                          </p>
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Primary action: Create Project */}
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

                      {/* More actions dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                          title={t("moreActions")}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === s.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              onClick={() => { setViewScript(s); setOpenMenuId(null); }}
                            >
                              <Eye size={14} />
                              {t("view")}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
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
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              onClick={() => {
                                setRewritePreSelectedId(s.id);
                                setShowRewrite(true);
                                setOpenMenuId(null);
                              }}
                            >
                              <RefreshCw size={14} />
                              {t("rewriteScript")}
                            </button>
                            <hr className="my-1 border-gray-200 dark:border-gray-700" />
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
                        const chLabel = sourceTypeLabel(ch.sourceType);
                        const rewrites = getChapterRewrites(ch.id);
                        return (
                          <div key={ch.id}>
                            <Card className="flex items-center justify-between gap-3 py-2 px-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 font-mono">#{ch.chapterIndex}</span>
                                  <span className="text-sm font-medium truncate">{ch.title}</span>
                                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${chLabel.color}`}>
                                    {chLabel.text}
                                  </span>
                                </div>
                                {ch.chapterSummary && (
                                  <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{ch.chapterSummary}</p>
                                )}
                              </div>
                              <Button
                                variant="secondary"
                                onClick={() => createProjectMutation.mutate(ch.id)}
                                disabled={createProjectMutation.isPending}
                                className="text-xs px-2 py-1 h-auto"
                              >
                                <FolderPlus size={12} className="mr-1" />
                                {t("createProject")}
                              </Button>
                            </Card>
                            {/* Rewrites for this chapter */}
                            {rewrites.map((rw) => {
                              const rwLabel = sourceTypeLabel(rw.sourceType);
                              return (
                                <Card key={rw.id} className="flex items-center justify-between gap-3 py-2 px-3 ml-6 mt-1 border-l-2 border-purple-200 dark:border-purple-800">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <RefreshCw size={12} className="text-purple-400 shrink-0" />
                                      <span className="text-sm font-medium truncate">{rw.title}</span>
                                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${rwLabel.color}`}>
                                        {rwLabel.text}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-400 line-clamp-1 mt-0.5 ml-5">{rw.content.slice(0, 100)}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => setViewScript(rw)}
                                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
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
                              );
                            })}
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
            className="space-y-4"
          >
            <Input
              id="edit-title"
              label={t("scriptTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div>
              <label htmlFor="edit-content" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("scriptContent")}
              </label>
              <textarea
                id="edit-content"
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
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
        <Modal
          open={!!viewScript}
          onClose={() => setViewScript(null)}
          title={viewScript?.title}
          className="max-w-2xl"
        >
          {viewScript && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sourceTypeLabel(viewScript.sourceType).color}`}>
                  {sourceTypeLabel(viewScript.sourceType).text}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(viewScript.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap dark:bg-gray-800">
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
        <ReverseScriptDialog
          open={showReverse}
          onClose={() => setShowReverse(false)}
          onSuccess={refreshScripts}
        />

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
