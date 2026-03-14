"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Download,
  List,
  ChevronUp,
  ChevronDown,
  BookOpen,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Types ──────────────────────────────────────────────────────────

interface Chapter {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  reviewScore: number | null;
  status: string;
}

interface FullTextData {
  title: string;
  format: string | null;
  totalChapters: number;
  totalWords: number;
  chapters: Chapter[];
}

// ─── Reader Page ────────────────────────────────────────────────────

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const id = params.id as string;
  const locale = (params.locale as string) || "zh";

  const [showToc, setShowToc] = useState(false);
  const [activeChapter, setActiveChapter] = useState(1);
  const chapterRefs = useRef<Record<number, HTMLElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<FullTextData>({
    queryKey: ["agent-project-full-text", id],
    queryFn: () => fetch(`/api/agent-projects/${id}/full-text`).then((r) => r.json()),
    enabled: sessionStatus === "authenticated",
  });

  // Track active chapter on scroll
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const scrollTop = contentRef.current.scrollTop + 120;

    let current = 1;
    for (const chapter of data?.chapters ?? []) {
      const el = chapterRefs.current[chapter.number];
      if (el && el.offsetTop <= scrollTop) {
        current = chapter.number;
      }
    }
    setActiveChapter(current);
  }, [data?.chapters]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToChapter = (num: number) => {
    const el = chapterRefs.current[num];
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" });
    }
    setShowToc(false);
  };

  const handleExport = () => {
    if (!data) return;
    const text = data.chapters
      .map((ch) => `# ${ch.title}\n\n${ch.content}`)
      .join("\n\n---\n\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <BookOpen size={32} className="text-[var(--color-text-tertiary)] animate-pulse" />
          <span className="text-sm text-[var(--color-text-tertiary)]">加载中...</span>
        </div>
      </div>
    );
  }

  if (!data || data.chapters.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center">
          <BookOpen size={40} className="mx-auto mb-3 text-[var(--color-text-tertiary)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">暂无内容</p>
          <button
            onClick={() => router.push(`/${locale}/agents`)}
            className="mt-4 text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-primary)]">
      {/* ─── TOC Sidebar (desktop) ─────────────────────────── */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <div className="p-4 border-b border-[var(--color-border-default)]">
          <button
            onClick={() => router.push(`/${locale}/agents`)}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer mb-3"
          >
            <ArrowLeft size={14} /> 返回
          </button>
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {data.title}
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {data.totalChapters} 章 · {data.totalWords.toLocaleString()} 字
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {data.chapters.map((ch) => (
            <button
              key={ch.number}
              onClick={() => scrollToChapter(ch.number)}
              className={`w-full text-left rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors cursor-pointer ${
                activeChapter === ch.number
                  ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-medium"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)]"
              }`}
            >
              <span className="block truncate">{ch.title}</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {ch.wordCount.toLocaleString()} 字
                {ch.reviewScore !== null && ` · ${ch.reviewScore}/50`}
              </span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-[var(--color-border-default)]">
          <button
            onClick={handleExport}
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Download size={14} /> 导出 TXT
          </button>
        </div>
      </aside>

      {/* ─── Main Content ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile + desktop) */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shrink-0">
          <button
            onClick={() => router.push(`/${locale}/agents`)}
            className="lg:hidden p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate lg:hidden">
              {data.title}
            </h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {data.chapters[activeChapter - 1]?.title ?? ""}
              <span className="ml-2">
                {activeChapter} / {data.totalChapters}
              </span>
            </p>
          </div>
          <button
            onClick={() => setShowToc(!showToc)}
            className="lg:hidden p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-primary)] cursor-pointer"
          >
            <List size={18} />
          </button>
          <button
            onClick={handleExport}
            className="hidden sm:flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] cursor-pointer lg:hidden"
          >
            <Download size={14} /> 导出
          </button>
          {/* Chapter nav arrows */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => activeChapter > 1 && scrollToChapter(activeChapter - 1)}
              disabled={activeChapter <= 1}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] disabled:opacity-30 cursor-pointer"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => activeChapter < data.totalChapters && scrollToChapter(activeChapter + 1)}
              disabled={activeChapter >= data.totalChapters}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] disabled:opacity-30 cursor-pointer"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        {/* Reading area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-8 sm:px-8">
            {data.chapters.map((ch) => (
              <article
                key={ch.number}
                ref={(el) => { chapterRefs.current[ch.number] = el; }}
                className="mb-16"
              >
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-6 pb-3 border-b border-[var(--color-border-default)]">
                  {ch.title}
                </h2>
                <div className="prose-reader text-[var(--color-text-secondary)] leading-[1.9] text-[15px]">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-4 indent-8">{children}</p>,
                      h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-[var(--color-text-primary)] mt-8 mb-4">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mt-6 mb-3">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-4 mb-2">{children}</h3>
                      ),
                      hr: () => <hr className="my-8 border-[var(--color-border-default)]" />,
                      blockquote: ({ children }) => (
                        <blockquote className="pl-4 border-l-2 border-[var(--color-accent)] text-[var(--color-text-tertiary)] my-4 italic">
                          {children}
                        </blockquote>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>
                      ),
                    }}
                  >
                    {ch.content}
                  </ReactMarkdown>
                </div>
              </article>
            ))}

            {/* End mark */}
            <div className="text-center py-12 text-[var(--color-text-tertiary)]">
              <p className="text-sm">— 全文完 —</p>
              <p className="text-xs mt-2">{data.totalWords.toLocaleString()} 字</p>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Mobile TOC Overlay ───────────────────────────── */}
      {showToc && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowToc(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-[var(--color-bg-surface)] shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-default)]">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">目录</span>
              <button onClick={() => setShowToc(false)} className="cursor-pointer">
                <X size={18} className="text-[var(--color-text-tertiary)]" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {data.chapters.map((ch) => (
                <button
                  key={ch.number}
                  onClick={() => scrollToChapter(ch.number)}
                  className={`w-full text-left rounded-[var(--radius-md)] px-3 py-2.5 text-sm cursor-pointer ${
                    activeChapter === ch.number
                      ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-medium"
                      : "text-[var(--color-text-secondary)]"
                  }`}
                >
                  {ch.title}
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-[var(--color-border-default)]">
              <button
                onClick={() => { handleExport(); setShowToc(false); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-3 py-2 text-sm font-medium text-white cursor-pointer"
              >
                <Download size={14} /> 导出 TXT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
