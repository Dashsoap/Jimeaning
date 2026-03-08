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
import { Plus, Trash2, Film, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

interface ProjectItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string;
  parentId: string | null;
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: projects, isLoading } = useQuery<ProjectItem[]>({
    queryKey: ["projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
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
      toast.success(tc("success"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
          <h1 className="text-2xl font-bold">{t("create").replace("创建", "")}</h1>
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
                    className="flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {childCount > 0 && (
                          <span className="text-gray-400">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </span>
                        )}
                        <h3 className="font-semibold">{p.title}</h3>
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
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{p.status}</span>
                        {childCount === 0 && (
                          <span>{p._count?.episodes ?? 0} episodes</span>
                        )}
                        <span>
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t("delete") + "?")) {
                          deleteMutation.mutate(p.id);
                        }
                      }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  </Card>

                  {/* Expanded child projects */}
                  {isExpanded && childCount > 0 && (
                    <ChildProjectList
                      parentId={p.id}
                      locale={locale}
                      router={router}
                      deleteMutation={deleteMutation}
                      deleteLabel={t("delete")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Modal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title={t("create")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ title, description });
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
      </div>
    </AppShell>
  );
}

function ChildProjectList({
  parentId,
  locale,
  router,
  deleteMutation,
  deleteLabel,
}: {
  parentId: string;
  locale: string;
  router: ReturnType<typeof useRouter>;
  deleteMutation: { mutate: (id: string) => void };
  deleteLabel: string;
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
          className="flex items-center justify-between py-2 px-3 border-l-2 border-blue-200 dark:border-blue-800"
        >
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{child.title}</h4>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span>{child.status}</span>
              <span>{child._count?.episodes ?? 0} episodes</span>
              <span>{new Date(child.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(deleteLabel + "?")) {
                deleteMutation.mutate(child.id);
              }
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        </Card>
      ))}
    </div>
  );
}
