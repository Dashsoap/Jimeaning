"use client";

import ReactMarkdown from "react-markdown";

interface ComparisonViewProps {
  originalText: string;
  rewrittenText: string;
}

export function ComparisonView({ originalText, rewrittenText }: ComparisonViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Original */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
            原文
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {originalText.length.toLocaleString()}字
          </span>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4 text-sm text-[var(--color-text-secondary)] leading-relaxed max-h-[60vh] overflow-y-auto">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="my-1.5">{children}</p>,
              h1: ({ children }) => <h1 className="text-lg font-bold text-[var(--color-text-primary)] mt-4 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-semibold text-[var(--color-text-primary)] mt-3 mb-1.5">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-2 mb-1">{children}</h3>,
            }}
          >
            {originalText}
          </ReactMarkdown>
        </div>
      </div>

      {/* Rewritten */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-accent)] uppercase tracking-wider">
            改写
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {rewrittenText.length.toLocaleString()}字
          </span>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4 text-sm text-[var(--color-text-secondary)] leading-relaxed max-h-[60vh] overflow-y-auto border border-[var(--color-accent)]/20">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="my-1.5">{children}</p>,
              h1: ({ children }) => <h1 className="text-lg font-bold text-[var(--color-text-primary)] mt-4 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-semibold text-[var(--color-text-primary)] mt-3 mb-1.5">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mt-2 mb-1">{children}</h3>,
            }}
          >
            {rewrittenText}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
