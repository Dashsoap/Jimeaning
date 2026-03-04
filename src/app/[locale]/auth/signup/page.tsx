"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Film } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Registration failed");
      setLoading(false);
      return;
    }

    router.push(`/${locale}/auth/signin`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <Film size={40} className="mx-auto text-blue-600 mb-3" />
          <h1 className="text-2xl font-bold">{t("signUpTitle")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="email"
            type="email"
            label={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            type="password"
            label={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            id="confirmPassword"
            type="password"
            label={t("confirmPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : t("signUpTitle")}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {t("hasAccount")}{" "}
          <Link
            href={`/${locale}/auth/signin`}
            className="text-blue-600 hover:underline"
          >
            {t("goSignIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
