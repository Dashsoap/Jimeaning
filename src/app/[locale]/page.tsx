"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Plus, FolderOpen, FileText, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

interface RecentProject {
  id: string;
  title: string;
  updatedAt: string;
  imageCount?: number;
}

export default function DashboardPage() {
  const t = useTranslations("app");
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    }
  }, [status, router, locale]);

  const { data: projects } = useQuery<RecentProject[]>({
    queryKey: ["projects"],
    queryFn: () => fetch("/api/projects").then((r) => r.json()),
    enabled: status === "authenticated",
  });

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!session) return null;

  const recentProjects = (projects || []).slice(0, 5);

  return (
    <AppShell>
      <div className="max-w-5xl">
        {/* Page title */}
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)] mb-8">
          {t("projects")}
        </h1>

        {/* Project grid — Lovart style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {/* New Project card */}
          <Link href={`/${locale}/projects`} className="group cursor-pointer">
            <div className="aspect-[4/3] rounded-[var(--radius-lg)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex flex-col items-center justify-center gap-2 transition-all group-hover:border-[var(--color-text-tertiary)] group-hover:shadow-sm">
              <Plus size={28} strokeWidth={1.5} className="text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]" />
              <span className="text-sm text-[var(--color-text-secondary)]">New Project</span>
            </div>
          </Link>

          {/* Recent projects */}
          {recentProjects.map((project) => (
            <Link
              key={project.id}
              href={`/${locale}/projects/${project.id}`}
              className="group cursor-pointer"
            >
              <div className="aspect-[4/3] rounded-[var(--radius-lg)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] overflow-hidden transition-all group-hover:shadow-sm group-hover:border-[var(--color-text-tertiary)]">
                {/* Placeholder thumbnail */}
                <div className="h-full w-full flex items-center justify-center">
                  <FolderOpen size={24} className="text-[var(--color-text-tertiary)]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {project.title}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  {new Date(project.updatedAt).toLocaleDateString(
                    locale === "zh" ? "zh-CN" : "en-US",
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick access */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <Link
            href={`/${locale}/scripts`}
            className="group flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4 transition-all hover:shadow-sm hover:border-[var(--color-text-tertiary)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]">
              <FileText size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t("scripts")}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">剧本管理</p>
            </div>
          </Link>

          <Link
            href={`/${locale}/assets`}
            className="group flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4 transition-all hover:shadow-sm hover:border-[var(--color-text-tertiary)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]">
              <ImageIcon size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t("assets")}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">角色 / 场景 / 配音</p>
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
