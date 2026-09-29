import { describe, expect, it } from "vitest";
import { RequestContext } from "../src/index.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("concurrent request isolation", () => {
  it("A/B/C concurrent contexts never leak into one another", async () => {
    const observed: Record<string, string[]> = { A: [], B: [], C: [] };

    async function simulatedRequest(id: string, workMs: number) {
      return RequestContext.run({ requestId: id }, async () => {
        // Check at multiple points interleaved with other requests.
        for (let i = 0; i < 5; i++) {
          await delay(workMs);
          const seen = RequestContext.getValue<string>("requestId");
          observed[id]?.push(seen ?? "<missing>");
          // Mutate own context — must not affect siblings.
          RequestContext.setValue(`touchedBy-${id}`, i);
        }
        // Sibling keys must never be visible here.
        expect(RequestContext.getValue("touchedBy-A") !== undefined).toBe(
          id === "A",
        );
        expect(RequestContext.getValue("touchedBy-B") !== undefined).toBe(
          id === "B",
        );
        expect(RequestContext.getValue("touchedBy-C") !== undefined).toBe(
          id === "C",
        );
        return RequestContext.getValue<string>("requestId");
      });
    }

    const [a, b, c] = await Promise.all([
      simulatedRequest("A", 7),
      simulatedRequest("B", 3),
      simulatedRequest("C", 5),
    ]);

    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(c).toBe("C");
    expect(observed.A).toEqual(["A", "A", "A", "A", "A"]);
    expect(observed.B).toEqual(["B", "B", "B", "B", "B"]);
    expect(observed.C).toEqual(["C", "C", "C", "C", "C"]);
  });

  it("100 concurrent contexts stay isolated", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `req-${i}`);
    const results = await Promise.all(
      ids.map((id, i) =>
        RequestContext.run({ requestId: id }, async () => {
          await delay(i % 7);
          return RequestContext.getValue<string>("requestId");
        }),
      ),
    );
    expect(results).toEqual(ids);
  });

  it("parallel sub-tasks inside one context share that context", async () => {
    await RequestContext.run({ requestId: "parent" }, async () => {
      const results = await Promise.all([
        (async () => {
          await delay(4);
          return RequestContext.getValue<string>("requestId");
        })(),
        (async () => {
          await delay(1);
          return RequestContext.getValue<string>("requestId");
        })(),
      ]);
      expect(results).toEqual(["parent", "parent"]);
    });
  });
});
