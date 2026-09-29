// Verifies the built package (dist/) works for both ESM and CJS consumers.
// Run via: npm run test:build
import assert from "node:assert";
import { createRequire } from "node:module";

const esm = await import("../dist/index.js");
assert.ok(esm.RequestContext, "ESM: RequestContext exported");
assert.strictEqual(typeof esm.RequestContext.run, "function");
assert.strictEqual(typeof esm.RequestContext.middleware, "function");
assert.strictEqual(typeof esm.generateRequestId, "function");

// Core round-trip through the built ESM bundle.
const seen = esm.RequestContext.run({ requestId: "build-check" }, () =>
  esm.RequestContext.get(),
);
assert.strictEqual(seen?.requestId, "build-check");
assert.strictEqual(esm.RequestContext.get(), undefined);

// Middleware factory callable without Express installed.
const mw = esm.RequestContext.middleware();
assert.strictEqual(typeof mw, "function");

// CJS bundle check.
const require = createRequire(import.meta.url);
const cjs = require("../dist/index.cjs");
assert.ok(cjs.RequestContext, "CJS: RequestContext exported");
const seenCjs = cjs.RequestContext.run({ requestId: "cjs-check" }, () =>
  cjs.RequestContext.get(),
);
assert.strictEqual(seenCjs?.requestId, "cjs-check");

console.log("build verification OK (ESM + CJS)");
