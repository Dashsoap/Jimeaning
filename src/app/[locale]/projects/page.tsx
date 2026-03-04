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
import { Plus, Trash2, Film } from "lucide-react";
import toast from "react-hot-toast";

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

  const { data: projects, isLoading } = useQuery({
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
            {projects.map(
              (p: {
                id: string;
                title: string;
                description: string | null;
                status: string;
                updatedAt: string;
                _count?: { episodes: number };
              }) => (
                <Card
                  key={p.id}
                  onClick={() => router.push(`/${locale}/projects/${p.id}`)}
                  className="flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold">{p.title}</h3>
                    {p.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{p.status}</span>
                      <span>{p._count?.episodes ?? 0} episodes</span>
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
              )
            )}
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
