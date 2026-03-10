"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Globe, Settings, LogOut, ChevronDown } from "lucide-react";

export function Header() {
  const t = useTranslations("app");
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const currentLocale = pathname.split("/")[1] || "zh";

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleLocale = () => {
    const newLocale = currentLocale === "zh" ? "en" : "zh";
    const rest = pathname.split("/").slice(2).join("/");
    router.push(`/${newLocale}/${rest}`);
  };

  const userInitial = session?.user
    ? (session.user.name || session.user.email || "U")[0].toUpperCase()
    : "U";

  return (
    <header className="flex h-14 items-center justify-end gap-1 bg-white px-6">
      {/* Language toggle */}
      <button
        onClick={toggleLocale}
        className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] cursor-pointer"
      >
        <Globe size={16} />
        {currentLocale === "zh" ? "EN" : "中文"}
      </button>

      {/* Settings */}
      <Link
        href={`/${currentLocale}/settings`}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
      >
        <Settings size={18} />
      </Link>

      {/* User menu */}
      {session?.user && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex h-9 items-center gap-2 rounded-full pl-1 pr-2.5 transition-colors hover:bg-[var(--color-bg-tertiary)] cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
              {userInitial}
            </div>
            <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
              {/* User info */}
              <div className="px-3 py-2.5 border-b border-[var(--color-border-light)]">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {session.user.name || session.user.email}
                </p>
                {session.user.name && session.user.email && (
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                    {session.user.email}
                  </p>
                )}
              </div>

              {/* Menu items */}
              <Link
                href={`/${currentLocale}/settings`}
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)] transition-colors"
              >
                <Settings size={15} />
                {t("settings")}
              </Link>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  signOut();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors cursor-pointer"
              >
                <LogOut size={15} />
                {t("signOut")}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
