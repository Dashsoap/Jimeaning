"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { TaskProgress } from "@/lib/task/types";

// ─── Types ─────────────────────────────────────────────────────────

interface AgentTerminalProps {
  taskId: string;
  events: TaskProgress[];
  /** Collapsed / expanded state managed by parent */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────

export function AgentTerminal({
  taskId,
  events,
  collapsed = false,
  onToggleCollapse,
}: AgentTerminalProps) {
  const [accumulated, setAccumulated] = useState("");
  const [scrollLocked, setScrollLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevChunkRef = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  // Find the event for our task
  const event = events.find((e) => e.taskId === taskId);

  // ─── Accumulate textChunk ───────────────────────────────────────
  useEffect(() => {
    if (event?.textChunk && event.textChunk !== prevChunkRef.current) {
      setAccumulated((prev) => prev + event.textChunk);
      prevChunkRef.current = event.textChunk;
    }
  }, [event?.textChunk]);

  // ─── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    if (!scrollLocked && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [accumulated, scrollLocked]);

  // ─── Detect manual scroll-up → auto-unlock ─────────────────────
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom && scrollLocked) setScrollLocked(false);
  }, [scrollLocked]);

  // ─── Derived state ─────────────────────────────────────────────
  const progressPct =
    event && event.totalSteps > 0
      ? Math.min(Math.round((event.progress / event.totalSteps) * 100), 100)
      : 0;

  const isRunning = event?.status === "running";
  const isCompleted = event?.status === "completed";
  const isFailed = event?.status === "failed";

  const statusLabel = isCompleted
    ? "COMPLETED"
    : isFailed
      ? "FAILED"
      : isRunning
        ? event?.message || "RUNNING"
        : "CONNECTING...";

  // ─── Clear ─────────────────────────────────────────────────────
  const handleClear = () => {
    setAccumulated("");
    prevChunkRef.current = "";
  };

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-2 rounded-[var(--radius-lg)] bg-[#0a0a0a] border border-[#00ff41]/20 px-4 py-2 text-xs font-mono text-[#00ff41] hover:bg-[#0a0a0a]/80 transition-colors cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          {isRunning && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff41] opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isCompleted
                ? "bg-[#00ff41]"
                : isFailed
                  ? "bg-red-500"
                  : "bg-[#00ff41]"
            }`}
          />
        </span>
        <span className="truncate">{statusLabel}</span>
        {progressPct > 0 && (
          <span className="ml-auto text-[#00ff41]/60">{progressPct}%</span>
        )}
        <ChevronDown size={14} />
      </button>
    );
  }

  return (
    <div
      className={`rounded-[var(--radius-lg)] overflow-hidden border border-[#00ff41]/20 ${
        fullscreen
          ? "fixed inset-4 z-50"
          : "relative"
      }`}
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.03) 2px, rgba(0,255,65,0.03) 4px)",
        }}
      />

      {/* ─── Top status bar ──────────────────────────────────── */}
      <div className="relative z-20 flex items-center gap-2 border-b border-[#00ff41]/10 px-3 py-1.5">
        {/* Blinking dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          {isRunning && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff41] opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isCompleted
                ? "bg-[#00ff41]"
                : isFailed
                  ? "bg-red-500"
                  : "bg-[#00ff41]"
            }`}
          />
        </span>

        <span className="font-mono text-xs text-[#00ff41] truncate">
          {statusLabel}
        </span>

        {/* Progress bar */}
        {progressPct > 0 && (
          <div className="ml-2 h-1.5 flex-1 max-w-48 rounded-full bg-[#00ff41]/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#00ff41] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {progressPct > 0 && (
          <span className="font-mono text-xs text-[#00ff41]/60 shrink-0">
            {progressPct}%
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 text-[#00ff41]/40 hover:text-[#00ff41] transition-colors cursor-pointer"
              title="Collapse"
            >
              <ChevronUp size={14} />
            </button>
          )}
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="p-1 text-[#00ff41]/40 hover:text-[#00ff41] transition-colors cursor-pointer"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ─── Terminal body ───────────────────────────────────── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`relative z-20 overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed ${
          fullscreen ? "h-[calc(100%-72px)]" : "h-72"
        }`}
      >
        {accumulated ? (
          <pre
            className="whitespace-pre-wrap break-words text-[#00ff41]"
            style={{ textShadow: "0 0 5px rgba(0, 255, 65, 0.3)" }}
          >
            {accumulated}
            {isRunning && <span className="animate-pulse text-[#00ff41]">▊</span>}
          </pre>
        ) : (
          <div className="flex items-center gap-2 text-[#00ff41]/40">
            {isRunning && (
              <>
                <span className="animate-pulse">▊</span>
                <span>Waiting for output...</span>
              </>
            )}
            {!isRunning && !isCompleted && !isFailed && (
              <span>Connecting...</span>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="mt-3 border-t border-[#00ff41]/10 pt-2 text-[#00ff41]">
            ✅ Task completed
          </div>
        )}
        {isFailed && (
          <div className="mt-3 border-t border-red-500/20 pt-2 text-red-400">
            ❌ Task failed{event?.errorCode ? ` [${event.errorCode}]` : ""}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* ─── Bottom toolbar ──────────────────────────────────── */}
      <div className="relative z-20 flex items-center gap-2 border-t border-[#00ff41]/10 px-3 py-1.5">
        <button
          onClick={handleClear}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono text-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/5 transition-colors cursor-pointer"
        >
          <Trash2 size={12} /> Clear
        </button>
        <button
          onClick={() => setScrollLocked((l) => !l)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono text-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/5 transition-colors cursor-pointer"
        >
          {scrollLocked ? <Lock size={12} /> : <Unlock size={12} />}
          {scrollLocked ? "Scroll locked" : "Auto-scroll"}
        </button>
        <span className="ml-auto font-mono text-xs text-[#00ff41]/20">
          {accumulated.length.toLocaleString()} chars
        </span>
      </div>

      {/* Fullscreen backdrop */}
      {fullscreen && (
        <div
          className="fixed inset-0 bg-black/80 -z-10"
          onClick={() => setFullscreen(false)}
        />
      )}

    </div>
  );
}
