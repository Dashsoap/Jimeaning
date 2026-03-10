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
import { Badge } from "@/components/ui/Badge";
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

type BadgeVariant = "default" | "accent" | "success" | "danger" | "warning" | "info";

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "草稿", variant: "default" },
  analyzing: { label: "分析中", variant: "warning" },
  ready: { label: "就绪", variant: "info" },
  generating: { label: "生成中", variant: "accent" },
  completed: { label: "完成", variant: "success" },
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

  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deletingProject, setDeletingProject] = useState<ProjectItem | null>(null);

  const { data: projects, isLoading } = useQuery<ProjectItem[]>({
    queryKey: ["projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string; style: string; aspectRatio: string }) =>
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
    mutationFn: (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeletingProject(null);
      toast.success(t("deleteSuccess"));
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; title: string; description: string }) =>
      fetch(`/api/projects/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.title, description: data.description }),
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t("create").replace("创建", "").replace("Create ", "") || t("title")}
          </h1>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} className="mr-1" />
            {t("create")}
          </Button>
        </div>

        {!projects?.length ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] py-16 text-center">
            <Film size={48} className="mx-auto mb-4 text-[var(--color-text-tertiary)]" />
            <p className="text-[var(--color-text-secondary)]">{t("noProjects")}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => {
              const childCount = p._count?.childProjects ?? 0;
              const isExpanded = expandedIds.has(p.id);
              const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;

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
                    className="group flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {childCount > 0 && (
                          <span className="text-[var(--color-text-tertiary)]">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </span>
                        )}
                        <h3 className="font-semibold text-[var(--color-text-primary)]">{p.title}</h3>
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        {childCount > 0 && (
                          <Badge variant="info">
                            {childCount} {t("childProjects")}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-1">
                          {p.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-text-tertiary)]">
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
                        <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(p);
                          setEditTitle(p.title);
                          setEditDescription(p.description || "");
                        }}
                        className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-secondary)] cursor-pointer"
                        title={t("editProject")}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProject(p);
                        }}
                        className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)] cursor-pointer"
                        title={t("delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </Card>

                  {isExpanded && childCount > 0 && (
                    <ChildProjectList
                      parentId={p.id}
                      locale={locale}
                      router={router}
                      onDelete={(child) => setDeletingProject(child as unknown as ProjectItem)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("create")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ title, description, style, aspectRatio });
            }}
            className="space-y-5"
          >
            <Input id="title" label={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Input id="description" label={t("description")} value={description} onChange={(e) => setDescription(e.target.value)} />

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                {t("aspectRatio")}
              </label>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={cn(
                      "flex-1 rounded-[var(--radius-md)] border-2 px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                      aspectRatio === r.value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                        : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]"
                    )}
                  >
                    {t(`aspectRatio${r.value.replace(":", "")}` as "aspectRatio169" | "aspectRatio916" | "aspectRatio11")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                {t("style")}
              </label>
              <div className="flex gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStyle(s.value)}
                    className={cn(
                      "flex-1 rounded-[var(--radius-md)] border-2 px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                      style === s.value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                        : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]"
                    )}
                  >
                    {t(`style${s.value.charAt(0).toUpperCase() + s.value.slice(1)}` as "styleRealistic" | "styleAnime" | "styleCinematic")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tc("create")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Project Modal */}
        <Modal open={!!editingProject} onClose={() => setEditingProject(null)} title={t("editProject")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingProject) {
                editMutation.mutate({ id: editingProject.id, title: editTitle, description: editDescription });
              }
            }}
            className="space-y-5"
          >
            <Input id="editTitle" label={t("title")} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            <Input id="editDescription" label={t("description")} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingProject(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {tc("save")}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal open={!!deletingProject} onClose={() => setDeletingProject(null)} title={t("delete")}>
          <div className="space-y-5">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t("deleteConfirm", { title: deletingProject?.title || "" })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingProject(null)}>
                {tc("cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (deletingProject) deleteMutation.mutate(deletingProject.id);
                }}
                disabled={deleteMutation.isPending}
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
    queryFn: () => fetch(`/api/projects/${parentId}/children`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="ml-6 mt-1 py-3 text-center">
        <div className="animate-spin inline-block h-4 w-4 border-b-2 border-[var(--color-accent)] rounded-full" />
      </div>
    );
  }

  return (
    <div className="ml-6 mt-1 space-y-1">
      {children.map((child) => (
        <Card
          key={child.id}
          onClick={() => router.push(`/${locale}/projects/${child.id}`)}
          className="group flex items-center justify-between py-2 px-3 border-l-2 border-[var(--color-accent-bg)]"
        >
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate text-[var(--color-text-primary)]">{child.title}</h4>
            <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-tertiary)]">
              <Badge variant={(STATUS_CONFIG[child.status] || STATUS_CONFIG.draft).variant}>
                {(STATUS_CONFIG[child.status] || STATUS_CONFIG.draft).label}
              </Badge>
              <span>{child._count?.episodes ?? 0} 集</span>
              <span>{new Date(child.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(child);
            }}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </Card>
      ))}
    </div>
  );
}
