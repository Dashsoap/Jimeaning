"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Film } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push(`/${locale}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm space-y-8 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] text-white">
            <Film size={24} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t("signInTitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : t("signInTitle")}
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--color-text-secondary)]">
          {t("noAccount")}{" "}
          <Link
            href={`/${locale}/auth/signup`}
            className="text-[var(--color-accent)] hover:underline"
          >
            {t("goSignUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
