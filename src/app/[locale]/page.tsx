"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FolderOpen, Film, Settings, ArrowRight } from "lucide-react";
import Link from "next/link";

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

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]" />
      </div>
    );
  }

  if (!session) return null;

  const cards = [
    {
      href: `/${locale}/projects`,
      icon: <FolderOpen size={22} />,
      title: t("projects"),
      desc: "管理视频项目",
    },
    {
      href: `/${locale}/assets`,
      icon: <Film size={22} />,
      title: t("assets"),
      desc: "全局资产库",
    },
    {
      href: `/${locale}/settings`,
      icon: <Settings size={22} />,
      title: t("settings"),
      desc: "API Key & 偏好",
    },
  ];

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">
          {t("dashboard")}
        </h1>
        <p className="text-[var(--color-text-secondary)] mb-10">
          {t("subtitle")}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="group">
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5 transition-all hover:shadow-sm hover:border-[var(--color-accent)]/30">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors group-hover:bg-[var(--color-accent-light)] group-hover:text-[var(--color-accent)]">
                  {card.icon}
                </div>
                <h3 className="font-semibold text-[var(--color-text)] mb-1">
                  {card.title}
                </h3>
                <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                  {card.desc}
                </p>
                <ArrowRight
                  size={16}
                  className="text-[var(--color-text-tertiary)] transition-all group-hover:text-[var(--color-accent)] group-hover:translate-x-1"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
