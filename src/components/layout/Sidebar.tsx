"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  FolderOpen,
  Image as ImageIcon,
  Settings,
  LogOut,
  Film,
  FileText,
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
  const { data: session } = useSession();

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
    {
      href: `/${locale}/settings`,
      icon: <Settings size={20} />,
      labelKey: "settings",
    },
  ];

  return (
    <aside className="flex h-screen w-16 flex-col items-center border-r border-[var(--color-border)] bg-white py-4">
      {/* Logo */}
      <Link
        href={`/${locale}`}
        className="mb-6 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white"
      >
        <Film size={20} />
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-1">
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
                  ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              {item.icon}
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {t(item.labelKey as "dashboard" | "projects" | "scripts" | "assets" | "settings")}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-xs font-medium text-[var(--color-text-secondary)]">
            {(session.user.name || session.user.email || "U")[0].toUpperCase()}
          </div>
          <button
            onClick={() => signOut()}
            className="group relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] cursor-pointer"
            title={t("signOut")}
          >
            <LogOut size={16} />
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t("signOut")}
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
