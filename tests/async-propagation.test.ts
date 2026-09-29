import { describe, expect, it } from "vitest";
import { RequestContext } from "../src/index.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("async propagation", () => {
  it("survives async/await and Promise chains", async () => {
    await RequestContext.run({ requestId: "A" }, async () => {
      expect(RequestContext.getValue("requestId")).toBe("A");
      await Promise.resolve();
      expect(RequestContext.getValue("requestId")).toBe("A");
      await delay(5);
      expect(RequestContext.getValue("requestId")).toBe("A");
      const viaThen = await Promise.resolve()
        .then(() => RequestContext.getValue<string>("requestId"))
        .then((v) => v);
      expect(viaThen).toBe("A");
    });
  });

  it("survives setTimeout", async () => {
    await RequestContext.run({ requestId: "T" }, async () => {
      const seen = await new Promise<string | undefined>((resolve) => {
        setTimeout(() => {
          resolve(RequestContext.getValue<string>("requestId"));
        }, 5);
      });
      expect(seen).toBe("T");
    });
  });

  it("survives setImmediate", async () => {
    await RequestContext.run({ requestId: "I" }, async () => {
      const seen = await new Promise<string | undefined>((resolve) => {
        setImmediate(() => {
          resolve(RequestContext.getValue<string>("requestId"));
        });
      });
      expect(seen).toBe("I");
    });
  });

  it("survives process.nextTick", async () => {
    await RequestContext.run({ requestId: "N" }, async () => {
      const seen = await new Promise<string | undefined>((resolve) => {
        process.nextTick(() => {
          resolve(RequestContext.getValue<string>("requestId"));
        });
      });
      expect(seen).toBe("N");
    });
  });

  it("survives Promise.all fan-out", async () => {
    await RequestContext.run({ requestId: "P" }, async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          (async () => {
            await delay(i % 3);
            return RequestContext.getValue<string>("requestId");
          })(),
        ),
      );
      expect(results).toEqual(Array(10).fill("P"));
    });
  });

  it("survives nested async functions and deep call chains", async () => {
    async function level3(): Promise<string | undefined> {
      await delay(3);
      return RequestContext.getValue<string>("requestId");
    }
    async function level2(): Promise<string | undefined> {
      await delay(1);
      return level3();
    }
    async function level1(): Promise<string | undefined> {
      return level2();
    }
    await RequestContext.run({ requestId: "D" }, async () => {
      expect(await level1()).toBe("D");
    });
  });
});
