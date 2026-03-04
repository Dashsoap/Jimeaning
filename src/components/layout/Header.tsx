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
    <header className="flex h-14 items-center justify-end border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-950">
      <button
        onClick={toggleLocale}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Globe size={16} />
        {currentLocale === "zh" ? "EN" : "中文"}
      </button>
    </header>
  );
}
