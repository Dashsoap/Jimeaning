"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
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
} from "lucide-react";
import toast from "react-hot-toast";

interface Script {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  sourceMedia: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  const [rewritePreSelectedId, setRewritePreSelectedId] = useState<string | undefined>();
  const [viewScript, setViewScript] = useState<Script | null>(null);
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: scripts = [], isLoading } = useQuery<Script[]>({
    queryKey: ["scripts"],
    queryFn: () => fetch("/api/scripts").then((r) => r.json()),
    enabled: status === "authenticated",
  });

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
      setTitle("");
      setContent("");
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
    };
    return labels[type] || labels.manual;
  };

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowReverse(true)}>
              <Upload size={18} className="mr-1" />
              {t("reverseScript")}
            </Button>
            <Button variant="secondary" onClick={() => { setRewritePreSelectedId(undefined); setShowRewrite(true); }}>
              <RefreshCw size={18} className="mr-1" />
              {t("rewriteScript")}
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} className="mr-1" />
              {t("createScript")}
            </Button>
          </div>
        </div>

        {!scripts.length ? (
          <Card className="py-12 text-center text-gray-500">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t("noScripts")}</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {scripts.map((s) => {
              const label = sourceTypeLabel(s.sourceType);
              return (
                <Card key={s.id} className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{s.title}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${label.color}`}>
                        {label.text}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                      {s.content.slice(0, 200)}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setViewScript(s)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      title={t("view")}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setEditScript(s);
                        setTitle(s.title);
                        setContent(s.content);
                      }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      title={tc("edit")}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setRewritePreSelectedId(s.id);
                        setShowRewrite(true);
                      }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      title={t("rewriteScript")}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      onClick={() => createProjectMutation.mutate(s.id)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20"
                      title={t("createProject")}
                      disabled={createProjectMutation.isPending}
                    >
                      <FolderPlus size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(tc("confirm") + "?")) {
                          deleteMutation.mutate(s.id);
                        }
                      }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title={tc("delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Script Modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("createScript")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ title, content });
            }}
            className="space-y-4"
          >
            <Input
              id="title"
              label={t("scriptTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div>
              <label htmlFor="content" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("scriptContent")}
              </label>
              <textarea
                id="content"
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tc("create")}
              </Button>
            </div>
          </form>
        </Modal>

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
