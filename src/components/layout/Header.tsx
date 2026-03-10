"use client";

import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = pathname.split("/")[1] || "zh";

  const toggleLocale = () => {
    const newLocale = currentLocale === "zh" ? "en" : "zh";
    const rest = pathname.split("/").slice(2).join("/");
    router.push(`/${newLocale}/${rest}`);
  };

  return (
    <header className="flex h-14 items-center justify-end border-b border-[var(--color-border-light)] bg-white px-8">
      <button
        onClick={toggleLocale}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)] cursor-pointer"
      >
        <Globe size={16} />
        {currentLocale === "zh" ? "EN" : "中文"}
      </button>
    </header>
  );
}
