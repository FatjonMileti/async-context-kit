import { describe, expect, it } from "vitest";
import { RequestContext, RequestContextError } from "../src/index.js";

describe("RequestContext core API", () => {
  it("returns undefined outside a context", () => {
    expect(RequestContext.get()).toBeUndefined();
    expect(RequestContext.has()).toBe(false);
    expect(RequestContext.getValue("requestId")).toBeUndefined();
  });

  it("run() exposes the context and restores absence afterwards", () => {
    const seen = RequestContext.run({ requestId: "abc" }, () =>
      RequestContext.get(),
    );
    expect(seen).toMatchObject({ requestId: "abc" });
    expect(RequestContext.get()).toBeUndefined();
  });

  it("shallow-copies the input so caller mutations do not leak in", () => {
    const input = { requestId: "orig" };
    RequestContext.run(input, () => {
      RequestContext.setValue("requestId", "changed");
    });
    expect(input.requestId).toBe("orig");
  });

  it("getValue() reads a single key", () => {
    RequestContext.run({ requestId: "r1", userId: "u1" }, () => {
      expect(RequestContext.getValue<string>("requestId")).toBe("r1");
      expect(RequestContext.getValue<string>("userId")).toBe("u1");
      expect(RequestContext.getValue("missing")).toBeUndefined();
    });
  });

  it("setValue() writes a single key", () => {
    RequestContext.run({ requestId: "r1" }, () => {
      RequestContext.setValue("userId", "u9");
      expect(RequestContext.getValue("userId")).toBe("u9");
    });
  });

  it("update() merges values", () => {
    RequestContext.run({ requestId: "r1" }, () => {
      RequestContext.update({ userId: "u2", tenantId: "t1" });
      expect(RequestContext.get()).toMatchObject({
        requestId: "r1",
        userId: "u2",
        tenantId: "t1",
      });
    });
  });

  it("setValue()/update() throw outside a context", () => {
    expect(() => RequestContext.setValue("a", 1)).toThrow(RequestContextError);
    expect(() => RequestContext.update({ a: 1 })).toThrow(RequestContextError);
  });

  it("getOrThrow() returns the store inside, throws outside", () => {
    RequestContext.run({ requestId: "x" }, () => {
      expect(RequestContext.getOrThrow().requestId).toBe("x");
    });
    expect(() => RequestContext.getOrThrow()).toThrow(RequestContextError);
  });

  it("supports typed custom contexts via generics", () => {
    interface MyContext {
      requestId: string;
      userId?: string;
      roles?: string[];
    }
    RequestContext.run<MyContext>({ requestId: "r", roles: ["admin"] }, () => {
      const ctx = RequestContext.get<MyContext>();
      expect(ctx?.roles).toEqual(["admin"]);
      RequestContext.setValue("userId", "u1");
      expect(RequestContext.getValue<string>("userId")).toBe("u1");
    });
  });

  it("supports arbitrary keys", () => {
    RequestContext.run({ requestId: "r", custom: { nested: true } }, () => {
      expect(RequestContext.getValue("custom")).toEqual({ nested: true });
    });
  });

  it("propagates return values and rejections through run()", async () => {
    const value = RequestContext.run({ requestId: "r" }, () => 42);
    expect(value).toBe(42);

    const asyncValue = await RequestContext.run({ requestId: "r" }, () =>
      Promise.resolve("ok"),
    );
    expect(asyncValue).toBe("ok");

    await expect(
      RequestContext.run({ requestId: "r" }, () =>
        Promise.reject(new Error("boom")),
      ),
    ).rejects.toThrow("boom");
  });

  it("nested run() scopes shadow outer values and restore afterwards", () => {
    RequestContext.run({ requestId: "outer" }, () => {
      expect(RequestContext.getValue("requestId")).toBe("outer");
      RequestContext.run({ requestId: "inner" }, () => {
        expect(RequestContext.getValue("requestId")).toBe("inner");
      });
      expect(RequestContext.getValue("requestId")).toBe("outer");
    });
  });
});
