import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the config to control log levels in tests
vi.mock("@/lib/logging/config", () => ({
  LOG_CONFIG: {
    enabled: true,
    level: "INFO" as const,
    debugEnabled: false,
    format: "json",
    service: "jimeaning-test",
    redactKeys: ["password", "token", "apikey", "secret"],
  },
  shouldLogLevel: (level: string) => {
    if (level === "DEBUG") return false;
    return true;
  },
}));

vi.mock("@/lib/logging/context", () => ({
  getLogContext: () => ({}),
}));

describe("logging/core", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs valid JSON for info logs", async () => {
    const { logInfo } = await import("@/lib/logging/core");
    logInfo("test message");

    const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1];
    const output = lastCall[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("INFO");
    expect(parsed.message).toBe("test message");
    expect(parsed.service).toBe("jimeaning-test");
    expect(parsed.ts).toBeDefined();
  });

  it("outputs errors to console.error", async () => {
    const { logError } = await import("@/lib/logging/core");
    logError("something broke");

    const lastCall = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1];
    const output = lastCall[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toBe("something broke");
  });

  it("scoped logger inherits context", async () => {
    const { createScopedLogger } = await import("@/lib/logging/core");
    const logger = createScopedLogger({ module: "test-module", taskId: "task-123" });

    const callsBefore = consoleSpy.mock.calls.length;
    logger.info("scoped message");

    const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1];
    expect(consoleSpy.mock.calls.length).toBe(callsBefore + 1);
    const parsed = JSON.parse(lastCall[0] as string);
    expect(parsed.module).toBe("test-module");
    expect(parsed.taskId).toBe("task-123");
  });

  it("child logger merges parent context", async () => {
    const { createScopedLogger } = await import("@/lib/logging/core");
    const parent = createScopedLogger({ module: "parent" });
    const child = parent.child({ taskId: "child-task" });

    child.info("child message");

    const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1];
    const parsed = JSON.parse(lastCall[0] as string);
    expect(parsed.module).toBe("parent");
    expect(parsed.taskId).toBe("child-task");
  });

  it("redacts sensitive keys in log output", async () => {
    const { createScopedLogger } = await import("@/lib/logging/core");
    const logger = createScopedLogger({ module: "redact-test" });

    logger.info({ message: "config loaded", details: { apiKey: "sk-secret-key", host: "localhost" } });

    const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1];
    const output = lastCall[0] as string;
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("sk-secret-key");
  });
});
