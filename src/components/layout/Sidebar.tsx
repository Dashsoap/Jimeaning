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

  // Extract locale from pathname
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
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-gray-200 dark:border-gray-800">
        <Film size={28} className="text-blue-600" />
        <span className="text-xl font-bold">{t("title")}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              )}
            >
              {item.icon}
              {t(item.labelKey as "dashboard" | "projects" | "assets" | "settings")}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-sm font-medium truncate">
                {session.user.name || session.user.email}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              title={t("signOut")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
