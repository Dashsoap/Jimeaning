import { describe, it, expect } from "vitest";
import { normalizeAnyError } from "@/lib/errors/normalize";

describe("normalizeAnyError", () => {
  it("classifies 429 status as RATE_LIMIT (retryable)", () => {
    const error = { status: 429, message: "Too many requests" };
    const result = normalizeAnyError(error);

    expect(result.code).toBe("RATE_LIMIT");
    expect(result.retryable).toBe(true);
    expect(result.httpStatus).toBe(429);
  });

  it("classifies 422 status as SENSITIVE_CONTENT (non-retryable)", () => {
    const error = { status: 422, message: "Content flagged" };
    const result = normalizeAnyError(error);

    expect(result.code).toBe("SENSITIVE_CONTENT");
    expect(result.retryable).toBe(false);
  });

  it('infers RATE_LIMIT from "rate limit" in message', () => {
    const error = new Error("rate limit exceeded for model gpt-4");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("RATE_LIMIT");
    expect(result.retryable).toBe(true);
  });

  it('infers GENERATION_TIMEOUT from "timeout" in message', () => {
    const error = new Error("Request timed out after 30s");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("GENERATION_TIMEOUT");
    expect(result.retryable).toBe(true);
  });

  it('infers NETWORK_ERROR from "fetch failed" in message', () => {
    const error = new Error("fetch failed: ECONNRESET");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("falls back to INTERNAL_ERROR for unknown errors", () => {
    const error = new Error("something unexpected happened");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.retryable).toBe(false);
  });

  it("handles TypeError with terminated message as NETWORK_ERROR", () => {
    const error = new TypeError("terminated");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("respects explicit error code on the error object", () => {
    const error = { code: "SENSITIVE_CONTENT", message: "blocked by policy" };
    const result = normalizeAnyError(error);

    expect(result.code).toBe("SENSITIVE_CONTENT");
    expect(result.retryable).toBe(false);
  });

  it("classifies 502 status as EXTERNAL_ERROR", () => {
    const error = { status: 502, message: "Bad Gateway" };
    const result = normalizeAnyError(error);

    expect(result.code).toBe("EXTERNAL_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("uses fallbackCode from options when no match", () => {
    const error = new Error("mysterious error");
    const result = normalizeAnyError(error, { fallbackCode: "GENERATION_FAILED" });

    expect(result.code).toBe("GENERATION_FAILED");
    expect(result.retryable).toBe(true);
  });

  it('infers SENSITIVE_CONTENT from "safety" in message', () => {
    const error = new Error("Content blocked by safety filter");
    const result = normalizeAnyError(error);

    expect(result.code).toBe("SENSITIVE_CONTENT");
    expect(result.retryable).toBe(false);
  });
});
