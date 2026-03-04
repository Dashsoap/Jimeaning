"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Image as ImageIcon } from "lucide-react";

export default function AssetsPage() {
  const t = useTranslations("app");

  return (
    <AppShell>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">{t("assets")}</h1>

        <Card className="py-12 text-center text-gray-500">
          <ImageIcon size={48} className="mx-auto mb-4 text-gray-300" />
          <p>Global asset library</p>
          <p className="text-sm mt-2">Characters, locations, and media assets for reuse across projects</p>
        </Card>
      </div>
    </AppShell>
  );
}
