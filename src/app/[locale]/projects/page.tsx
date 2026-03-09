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
import {
  Plus,
  Trash2,
  Film,
  ChevronDown,
  ChevronUp,
  Pencil,
  ImageIcon,
  Video,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ProjectItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  style: string;
  aspectRatio: string;
  updatedAt: string;
  parentId: string | null;
  imageCount?: number;
  videoCount?: number;
  _count?: { episodes: number; childProjects: number };
}

interface ChildProject {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string;
  _count?: { episodes: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: {
    label: "草稿",
    color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  analyzing: {
    label: "分析中",
    color:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  },
  ready: {
    label: "就绪",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  generating: {
    label: "生成中",
    color:
      "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  },
  completed: {
    label: "完成",
    color:
      "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
};

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
];

const STYLES = [
  { value: "realistic", label: "真人风格" },
  { value: "anime", label: "动漫风" },
  { value: "cinematic", label: "电影感" },
];

export default function ProjectsPage() {
  const t = useTranslations("project");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "zh";
  const { status } = useSession();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [style, setStyle] = useState("realistic");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Delete confirm state
  const [deletingProject, setDeletingProject] = useState<ProjectItem | null>(
    null,
  );

  const { data: projects, isLoading } = useQuery<ProjectItem[]>({
    queryKey: ["projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      style: string;
      aspectRatio: string;
    }) =>
      fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setAspectRatio("16:9");
      setStyle("realistic");
      toast.success(tc("success"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeletingProject(null);
      toast.success(t("deleteSuccess"));
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: {
      id: string;
      title: string;
      description: string;
    }) =>
      fetch(`/api/projects/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingProject(null);
      toast.success(tc("success"));
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          <h1 className="text-2xl font-bold">{t("create").replace("创建", "").replace("Create ", "") || t("title")}</h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} className="mr-1" />
            {t("create")}
          </Button>
        </div>

        {!projects?.length ? (
          <Card className="py-12 text-center text-gray-500">
            <Film size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t("noProjects")}</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => {
              const childCount = p._count?.childProjects ?? 0;
              const isExpanded = expandedIds.has(p.id);
              const statusCfg =
                STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;

              return (
                <div key={p.id}>
                  <Card
                    onClick={() => {
                      if (childCount > 0) {
                        toggleExpand(p.id);
                      } else {
                        router.push(`/${locale}/projects/${p.id}`);
                      }
                    }}
                    className="group flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {childCount > 0 && (
                          <span className="text-gray-400">
                            {isExpanded ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </span>
                        )}
                        <h3 className="font-semibold">{p.title}</h3>
                        {/* Status Badge */}
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}
                        >
                          {statusCfg.label}
                        </span>
                        {childCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {childCount} {t("childProjects")}
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                          {p.description}
                        </p>
                      )}
                      {/* Stats Row */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {childCount === 0 && (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {p._count?.episodes ?? 0} 集
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {p.imageCount ?? 0} 图
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Video className="h-3 w-3" />
                              {p.videoCount ?? 0} 视频
                            </span>
                          </>
                        )}
                        <span>
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Hover action buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(p);
                          setEditTitle(p.title);
                          setEditDescription(p.description || "");
                        }}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        title={t("editProject")}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProject(p);
                        }}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title={t("delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </Card>

                  {/* Expanded child projects */}
                  {isExpanded && childCount > 0 && (
                    <ChildProjectList
                      parentId={p.id}
                      locale={locale}
                      router={router}
                      onDelete={(child) =>
                        setDeletingProject(child as unknown as ProjectItem)
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title={t("create")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                title,
                description,
                style,
                aspectRatio,
              });
            }}
            className="space-y-4"
          >
            <Input
              id="title"
              label={t("title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              id="description"
              label={t("description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {/* Aspect Ratio Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("aspectRatio")}
              </label>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={cn(
                      "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all",
                      aspectRatio === r.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300",
                    )}
                  >
                    <div className="text-center">
                      <span>{t(`aspectRatio${r.value.replace(":", "")}` as "aspectRatio169" | "aspectRatio916" | "aspectRatio11")}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Style Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("style")}
              </label>
              <div className="flex gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStyle(s.value)}
                    className={cn(
                      "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all",
                      style === s.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300",
                    )}
                  >
                    {t(`style${s.value.charAt(0).toUpperCase() + s.value.slice(1)}` as "styleRealistic" | "styleAnime" | "styleCinematic")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tc("create")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Project Modal */}
        <Modal
          open={!!editingProject}
          onClose={() => setEditingProject(null)}
          title={t("editProject")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingProject) {
                editMutation.mutate({
                  id: editingProject.id,
                  title: editTitle,
                  description: editDescription,
                });
              }
            }}
            className="space-y-4"
          >
            <Input
              id="editTitle"
              label={t("title")}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
            <Input
              id="editDescription"
              label={t("description")}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingProject(null)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {tc("save")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={!!deletingProject}
          onClose={() => setDeletingProject(null)}
          title={t("delete")}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("deleteConfirm", {
                title: deletingProject?.title || "",
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeletingProject(null)}
              >
                {tc("cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (deletingProject) {
                    deleteMutation.mutate(deletingProject.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                className="!bg-red-600 hover:!bg-red-700"
              >
                {t("delete")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

function ChildProjectList({
  parentId,
  locale,
  router,
  onDelete,
}: {
  parentId: string;
  locale: string;
  router: ReturnType<typeof useRouter>;
  onDelete: (child: ChildProject) => void;
}) {
  const { data: children = [], isLoading } = useQuery<ChildProject[]>({
    queryKey: ["projects", parentId, "children"],
    queryFn: () =>
      fetch(`/api/projects/${parentId}/children`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="ml-6 mt-1 py-3 text-center text-sm text-gray-400">
        <div className="animate-spin inline-block h-4 w-4 border-b-2 border-blue-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="ml-6 mt-1 space-y-1">
      {children.map((child) => (
        <Card
          key={child.id}
          onClick={() => router.push(`/${locale}/projects/${child.id}`)}
          className="group flex items-center justify-between py-2 px-3 border-l-2 border-blue-200 dark:border-blue-800"
        >
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{child.title}</h4>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span
                className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${(STATUS_CONFIG[child.status] || STATUS_CONFIG.draft).color}`}
              >
                {(STATUS_CONFIG[child.status] || STATUS_CONFIG.draft).label}
              </span>
              <span>{child._count?.episodes ?? 0} 集</span>
              <span>{new Date(child.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(child);
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={14} />
          </button>
        </Card>
      ))}
    </div>
  );
}
