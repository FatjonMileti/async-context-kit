import { describe, expect, it } from "vitest";
import { RequestContext } from "../src/index.js";

interface CustomContext {
  requestId?: string;
  userId?: string;
}

describe("RequestContext.getSnapshot", () => {
  it("returns undefined outside an active context", () => {
    expect(RequestContext.getSnapshot()).toBeUndefined();
  });

  it("returns a frozen copy matching the live store", () => {
    RequestContext.run({ requestId: "snap-1", userId: "u-1" }, () => {
      const snapshot = RequestContext.getSnapshot();
      expect(snapshot).toEqual({ requestId: "snap-1", userId: "u-1" });
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  it("is unaffected by later writes to the live store", () => {
    RequestContext.run({ requestId: "snap-2" }, () => {
      const snapshot = RequestContext.getSnapshot();
      RequestContext.setValue("requestId", "mutated");
      RequestContext.update({ extra: true });
      expect(snapshot).toEqual({ requestId: "snap-2" });
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  it("writes to the snapshot throw instead of corrupting state", () => {
    RequestContext.run({ requestId: "snap-3" }, () => {
      const snapshot = RequestContext.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(() => {
        (snapshot as Record<string, unknown>)["requestId"] = "tampered";
      }).toThrow(TypeError);
      expect(RequestContext.get()?.requestId).toBe("snap-3");
    });
  });

  it("supports typed contexts", () => {
    RequestContext.run<CustomContext>({ userId: "u-9" }, () => {
      const snapshot = RequestContext.getSnapshot<CustomContext>();
      expect(snapshot?.userId).toBe("u-9");
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });
});
