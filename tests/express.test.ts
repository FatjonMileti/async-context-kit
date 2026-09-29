import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { RequestContext } from "../src/index.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildApp(
  middlewareOptions?: Parameters<typeof RequestContext.middleware>[0],
) {
  const app = express();
  app.use(RequestContext.middleware(middlewareOptions));

  app.get("/test", (_req, res) => {
    res.json({ context: RequestContext.get() ?? null });
  });

  app.get("/async-service", async (_req, res) => {
    await delay(10);
    const context = RequestContext.get();
    await delay(5);
    res.json({
      requestId: context?.requestId,
      stillThere: RequestContext.getValue("requestId"),
    });
  });

  app.get("/meta", (_req, res) => {
    const ctx = RequestContext.get();
    res.json({
      requestId: ctx?.requestId,
      method: ctx?.method,
      path: ctx?.path,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  });

  return app;
}

describe("Express middleware", () => {
  it("generates a request ID and exposes it in the response header", async () => {
    const app = buildApp();
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
    const generated = res.headers["x-request-id"];
    expect(typeof generated).toBe("string");
    expect(generated.length).toBeGreaterThan(0);
    expect(res.body.context.requestId).toBe(generated);
  });

  it("preserves a valid incoming request ID", async () => {
    const app = buildApp();
    const res = await request(app).get("/test").set("X-Request-ID", "abc123");
    expect(res.headers["x-request-id"]).toBe("abc123");
    expect(res.body.context.requestId).toBe("abc123");
  });

  it("replaces an over-long incoming request ID with a generated one", async () => {
    const app = buildApp();
    const evil = "x".repeat(500);
    const res = await request(app).get("/test").set("X-Request-ID", evil);
    expect(res.body.context.requestId).not.toBe(evil);
    expect(res.body.context.requestId).toBe(res.headers["x-request-id"]);
  });

  it("supports a custom header name", async () => {
    const app = buildApp({
      requestId: { header: "x-correlation-id", responseHeader: true },
    });
    const res = await request(app)
      .get("/test")
      .set("X-Correlation-ID", "corr-1");
    expect(res.headers["x-correlation-id"]).toBe("corr-1");
    expect(res.body.context.requestId).toBe("corr-1");
  });

  it("can disable the response header", async () => {
    const app = buildApp({ requestId: { responseHeader: false } });
    const res = await request(app).get("/test");
    expect(res.headers["x-request-id"]).toBeUndefined();
    // Context still populated.
    expect(typeof res.body.context.requestId).toBe("string");
  });

  it("supports a custom response header name", async () => {
    const app = buildApp({
      requestId: { header: "x-request-id", responseHeader: "x-reply-id" },
    });
    const res = await request(app).get("/test").set("X-Request-ID", "r1");
    expect(res.headers["x-reply-id"]).toBe("r1");
  });

  it("populates request metadata (method/path/ip/userAgent)", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/meta")
      .set("User-Agent", "vitest-agent");
    expect(res.body.method).toBe("GET");
    expect(res.body.path).toBe("/meta");
    expect(typeof res.body.ip).toBe("string");
    expect(res.body.userAgent).toBe("vitest-agent");
    // Must not leak sensitive data by default.
    expect(res.body).not.toHaveProperty("headers");
    expect(res.body).not.toHaveProperty("cookies");
  });

  it("keeps context available inside async services", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/async-service")
      .set("X-Request-ID", "svc-1");
    expect(res.body.requestId).toBe("svc-1");
    expect(res.body.stillThere).toBe("svc-1");
  });

  it("keeps concurrent requests isolated", async () => {
    // Slow route so requests overlap in time.
    const app = express();
    app.use(RequestContext.middleware());
    app.get("/slow", async (_req, res) => {
      const before = RequestContext.getValue<string>("requestId");
      await delay(20);
      const after = RequestContext.getValue<string>("requestId");
      res.json({ before, after });
    });

    const ids = ["req-A", "req-B", "req-C", "req-D", "req-E"];
    const responses = await Promise.all(
      ids.map((id) => request(app).get("/slow").set("X-Request-ID", id)),
    );
    responses.forEach((res, i) => {
      expect(res.body.before).toBe(ids[i]);
      expect(res.body.after).toBe(ids[i]);
    });
  });

  it("supports extra context via function (e.g. userId)", async () => {
    const app = express();
    app.use(
      RequestContext.middleware({
        context: () => ({ userId: "user-42", tenantId: "tenant-7" }),
      }),
    );
    app.get("/whoami", (_req, res) => {
      res.json(RequestContext.get());
    });
    const res = await request(app).get("/whoami");
    expect(res.body.userId).toBe("user-42");
    expect(res.body.tenantId).toBe("tenant-7");
    expect(typeof res.body.requestId).toBe("string");
  });

  it("trustIncoming: false always generates server-side IDs", async () => {
    const app = buildApp({ requestId: { trustIncoming: false } });
    const res = await request(app)
      .get("/test")
      .set("X-Request-ID", "client-spoofed");
    expect(res.body.context.requestId).not.toBe("client-spoofed");
  });
});
