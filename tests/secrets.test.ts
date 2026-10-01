import { describe, expect, it } from "vitest";
import { createExpressMiddleware, RequestContext } from "../src/index.js";
import type { ExpressLikeRequest } from "../src/index.js";

// Keys the default middleware is allowed to populate. Anything else
// (headers, cookies, bodies, query strings) must never reach the store.
const SAFE_KEYS = ["requestId", "method", "path", "ip", "userAgent"];

function captureStore(req: ExpressLikeRequest): Record<string, unknown> {
  let seen: Record<string, unknown> = {};
  createExpressMiddleware()(req, { setHeader: () => {} }, () => {
    seen = { ...(RequestContext.get() ?? {}) };
  });
  return seen;
}

describe("secrets discipline", () => {
  it("stores only allowlisted metadata, even with hostile request data", () => {
    const store = captureStore({
      headers: {
        authorization: "Bearer super-secret-token",
        cookie: "session=abc123",
        "x-request-id": "test-id",
        "user-agent": "vitest",
      },
      method: "POST",
      path: "/login",
      url: "/login?password=hunter2",
      ip: "127.0.0.1",
      body: { username: "root", password: "hunter2" },
      query: { token: "tok-123" },
    });

    expect(Object.keys(store).sort()).toEqual([...SAFE_KEYS].sort());
    expect(store.requestId).toBe("test-id");
  });

  it("never leaks secret values into the serialized store", () => {
    const store = captureStore({
      headers: {
        authorization: "Bearer super-secret-token",
        cookie: "session=abc123",
        "user-agent": "vitest",
      },
      method: "GET",
      path: "/",
      body: { password: "hunter2" },
    });

    const serialized = JSON.stringify(store);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("hunter2");
    for (const forbidden of [
      "authorization",
      "cookie",
      "headers",
      "cookies",
      "body",
      "query",
      "password",
      "token",
    ]) {
      expect(store).not.toHaveProperty(forbidden);
    }
  });
});
