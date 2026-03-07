import { describe, it, expect } from "vitest";
import { redactValue } from "@/lib/logging/redact";

describe("redactValue", () => {
  const redactKeys = ["password", "token", "apikey", "secret", "authorization"];

  it("redacts keys containing sensitive names", () => {
    const input = { username: "john", password: "secret123", apiKey: "sk-abc" };
    const result = redactValue(input, redactKeys) as Record<string, unknown>;

    expect(result.username).toBe("john");
    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
  });

  it("redacts nested objects", () => {
    const input = {
      config: {
        provider: "openai",
        apiKey: "sk-test",
        nested: { secretToken: "tok-abc" },
      },
    };
    const result = redactValue(input, redactKeys) as Record<string, unknown>;
    const config = result.config as Record<string, unknown>;

    expect(config.provider).toBe("openai");
    expect(config.apiKey).toBe("[REDACTED]");
    const nested = config.nested as Record<string, unknown>;
    expect(nested.secretToken).toBe("[REDACTED]");
  });

  it("handles arrays", () => {
    const input = [{ password: "pass1" }, { password: "pass2" }];
    const result = redactValue(input, redactKeys) as Record<string, unknown>[];

    expect(result[0].password).toBe("[REDACTED]");
    expect(result[1].password).toBe("[REDACTED]");
  });

  it("returns [MaxDepth] for deeply nested objects", () => {
    let obj: Record<string, unknown> = { value: "deep" };
    for (let i = 0; i < 10; i++) {
      obj = { nested: obj };
    }
    const result = JSON.stringify(redactValue(obj, redactKeys));
    expect(result).toContain("[MaxDepth]");
  });

  it("passes through primitives unchanged", () => {
    expect(redactValue("hello", redactKeys)).toBe("hello");
    expect(redactValue(42, redactKeys)).toBe(42);
    expect(redactValue(null, redactKeys)).toBe(null);
    expect(redactValue(undefined, redactKeys)).toBe(undefined);
  });
});
