"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Film, FolderOpen, Settings } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <AppShell>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-1">{t("dashboard")}</h1>
        <p className="text-gray-500 mb-8">{t("subtitle")}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href={`/${locale}/projects`}>
            <Card className="flex items-center gap-4 hover:border-blue-300 transition-colors">
              <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/30">
                <FolderOpen className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">{t("projects")}</h3>
                <p className="text-sm text-gray-500">管理视频项目</p>
              </div>
            </Card>
          </Link>

          <Link href={`/${locale}/assets`}>
            <Card className="flex items-center gap-4 hover:border-blue-300 transition-colors">
              <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/30">
                <Film className="text-green-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">{t("assets")}</h3>
                <p className="text-sm text-gray-500">全局资产库</p>
              </div>
            </Card>
          </Link>

          <Link href={`/${locale}/settings`}>
            <Card className="flex items-center gap-4 hover:border-blue-300 transition-colors">
              <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/30">
                <Settings className="text-purple-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">{t("settings")}</h3>
                <p className="text-sm text-gray-500">API Key & 偏好</p>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
