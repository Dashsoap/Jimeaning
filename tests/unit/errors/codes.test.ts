import { describe, it, expect } from "vitest";
import {
  ERROR_CATALOG,
  isKnownErrorCode,
  resolveUnifiedErrorCode,
  getErrorSpec,
} from "@/lib/errors/codes";

describe("Error codes", () => {
  it("RATE_LIMIT is retryable", () => {
    expect(ERROR_CATALOG.RATE_LIMIT.retryable).toBe(true);
  });

  it("SENSITIVE_CONTENT is not retryable", () => {
    expect(ERROR_CATALOG.SENSITIVE_CONTENT.retryable).toBe(false);
  });

  it("INTERNAL_ERROR is not retryable", () => {
    expect(ERROR_CATALOG.INTERNAL_ERROR.retryable).toBe(false);
  });

  it("WATCHDOG_TIMEOUT is retryable", () => {
    expect(ERROR_CATALOG.WATCHDOG_TIMEOUT.retryable).toBe(true);
  });

  it("isKnownErrorCode validates correctly", () => {
    expect(isKnownErrorCode("RATE_LIMIT")).toBe(true);
    expect(isKnownErrorCode("UNKNOWN_CODE")).toBe(false);
    expect(isKnownErrorCode(42)).toBe(false);
  });

  it("resolveUnifiedErrorCode resolves known codes", () => {
    expect(resolveUnifiedErrorCode("RATE_LIMIT")).toBe("RATE_LIMIT");
    expect(resolveUnifiedErrorCode("BOGUS")).toBeNull();
  });

  it("getErrorSpec returns correct spec", () => {
    const spec = getErrorSpec("RATE_LIMIT");
    expect(spec.httpStatus).toBe(429);
    expect(spec.retryable).toBe(true);
    expect(spec.category).toBe("PROVIDER");
  });
});
