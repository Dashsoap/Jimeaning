"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  labelKey: string;
}

export function Sidebar() {
  const t = useTranslations("app");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "zh";

  const navItems: NavItem[] = [
    {
      href: `/${locale}`,
      icon: <Home size={20} />,
      labelKey: "dashboard",
    },
    {
      href: `/${locale}/projects`,
      icon: <FolderOpen size={20} />,
      labelKey: "projects",
    },
    {
      href: `/${locale}/scripts`,
      icon: <FileText size={20} />,
      labelKey: "scripts",
    },
    {
      href: `/${locale}/assets`,
      icon: <ImageIcon size={20} />,
      labelKey: "assets",
    },
    {
      href: `/${locale}/agents`,
      icon: <Sparkles size={20} />,
      labelKey: "agents",
    },
  ];

  return (
    <aside className="fixed left-3 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2">
      {/* New Project */}
      <button
        onClick={() => router.push(`/${locale}/projects?create=true`)}
        className="group relative mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--color-text-secondary)] shadow-md transition-all hover:shadow-lg hover:text-[var(--color-accent)] cursor-pointer"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {t("newProject")}
        </span>
      </button>

      {/* Navigation */}
      {navItems.map((item) => {
        const isActive =
          item.href === `/${locale}`
            ? pathname === `/${locale}` || pathname === `/${locale}/`
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-full transition-all cursor-pointer",
              isActive
                ? "bg-white text-[var(--color-text-primary)] shadow-md ring-2 ring-[var(--color-text-primary)]/10"
                : "bg-white/80 text-[var(--color-text-tertiary)] shadow-sm hover:bg-white hover:shadow-md hover:text-[var(--color-text-secondary)]"
            )}
          >
            {item.icon}
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t(item.labelKey as "dashboard" | "projects" | "scripts" | "assets" | "agents")}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
