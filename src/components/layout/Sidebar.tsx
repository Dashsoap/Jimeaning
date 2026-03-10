"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  FolderOpen,
  Image as ImageIcon,
  Film,
  FileText,
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
  const locale = pathname.split("/")[1] || "zh";

  const navItems: NavItem[] = [
    {
      href: `/${locale}`,
      icon: <LayoutDashboard size={20} />,
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
  ];

  return (
    <aside className="flex h-screen w-[68px] flex-col items-center bg-[var(--color-bg-secondary)] py-5">
      {/* Logo */}
      <Link
        href={`/${locale}`}
        className="mb-8 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white shadow-sm"
      >
        <Film size={20} />
      </Link>

      {/* New Project shortcut */}
      <Link
        href={`/${locale}/projects`}
        className="group relative mb-6 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        <Plus size={20} />
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
          {t("projects")}
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-1.5">
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
                "group relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors",
                isActive
                  ? "bg-white text-[var(--color-accent)] shadow-sm"
                  : "text-[var(--color-text-tertiary)] hover:bg-white/60 hover:text-[var(--color-text-secondary)]"
              )}
            >
              {item.icon}
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                {t(item.labelKey as "dashboard" | "projects" | "scripts" | "assets")}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
