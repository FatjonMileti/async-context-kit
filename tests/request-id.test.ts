import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_REQUEST_ID_LENGTH,
  generateRequestId,
  isValidRequestId,
  normalizeRequestId,
  resolveRequestId,
} from "../src/index.js";

describe("request IDs", () => {
  it("generates UUID-shaped IDs", () => {
    const id = generateRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 1000 }, generateRequestId));
    expect(ids.size).toBe(1000);
  });

  it("validates incoming IDs", () => {
    expect(isValidRequestId("abc-123")).toBe(true);
    expect(isValidRequestId("  abc  ")).toBe(true);
    expect(isValidRequestId("")).toBe(false);
    expect(isValidRequestId("   ")).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
    expect(isValidRequestId(["a"])).toBe(false);
    expect(isValidRequestId("a\nb")).toBe(false);
    expect(isValidRequestId("a\rb")).toBe(false);
    expect(isValidRequestId("x".repeat(DEFAULT_MAX_REQUEST_ID_LENGTH))).toBe(
      true,
    );
    expect(
      isValidRequestId("x".repeat(DEFAULT_MAX_REQUEST_ID_LENGTH + 1)),
    ).toBe(false);
  });

  it("normalizes by trimming", () => {
    expect(normalizeRequestId("  abc  ")).toBe("abc");
    expect(normalizeRequestId("")).toBeUndefined();
  });

  it("resolveRequestId prefers valid incoming IDs", () => {
    expect(resolveRequestId("abc-123")).toBe("abc-123");
    expect(resolveRequestId("  abc  ")).toBe("abc");
  });

  it("resolveRequestId generates when incoming is missing/invalid", () => {
    const a = resolveRequestId(undefined);
    expect(typeof a).toBe("string");
    const b = resolveRequestId("x".repeat(500));
    expect(typeof b).toBe("string");
    expect(b).not.toBe("x".repeat(500));
  });

  it("resolveRequestId honors trustIncoming: false", () => {
    const id = resolveRequestId("client-id", { trustIncoming: false });
    expect(id).not.toBe("client-id");
    expect(typeof id).toBe("string");
  });

  it("resolveRequestId honors generate: false", () => {
    expect(resolveRequestId(undefined, { generate: false })).toBeUndefined();
    // Valid incoming is still honored when generate is false.
    expect(resolveRequestId("keep-me", { generate: false })).toBe("keep-me");
    // Invalid incoming with generate:false yields undefined (dropped).
    expect(
      resolveRequestId("x".repeat(500), { generate: false }),
    ).toBeUndefined();
  });
});
