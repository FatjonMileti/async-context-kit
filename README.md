# async-context-kit

Tiny, dependency-free, request-scoped context for Node.js — built on [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html).

Store request IDs, user IDs, tenant IDs, and tracing/logging metadata once, then read them anywhere in the async call chain — no more threading `req` or `ctx` through every function argument.

- **Zero runtime dependencies** (Node built-ins only)
- **Framework-agnostic core** + opt-in **Express middleware**
- **Typed**: bring your own context interface
- **ESM + CommonJS** builds with type declarations
- Requires **Node.js >= 18**

## Why AsyncLocalStorage?

`AsyncLocalStorage` (from `node:async_hooks`) is Node's official mechanism for propagating implicit state across asynchronous operations. Unlike globals or request-keyed `Map`s, it is:

- **Concurrency-safe** — concurrent requests each see only their own store, even when their async work interleaves.
- **Automatic** — context flows through `await`, `Promise.all`, `setTimeout`, streams, and EventEmitters without manual plumbing.
- **Self-cleaning** — the store's lifetime is tied to the callback; nothing to dispose.

This library is a thin, well-typed wrapper around it with request-ID handling and an Express middleware.

## Installation

```bash
npm install async-context-kit
```

## Quick start (Express)

```ts
import express from "express";
import { RequestContext } from "async-context-kit";

const app = express();

app.use(
  RequestContext.middleware({
    requestId: { header: "x-request-id", generate: true, responseHeader: true },
  }),
);

app.get("/users", async (req, res) => {
  console.log(RequestContext.get()?.requestId);
  const users = await userService.getUsers(); // context visible in here too
  res.json(users);
});
```

## Core API (framework-agnostic)

```ts
import { RequestContext } from "async-context-kit";

RequestContext.run({ requestId: "123", userId: "456" }, async () => {
  await doSomething();
  console.log(RequestContext.get()); // { requestId: "123", userId: "456" }
});
```

| Method       | Signature                          | Behavior                                                                                           |
| ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `run`        | `run(context, callback)`           | Runs `callback` with a (shallow-copied) active context. Returns/throws whatever the callback does. |
| `get`        | `get()` → `T \| undefined`         | Returns the live store, or `undefined` outside a context.                                          |
| `getOrThrow` | `getOrThrow()` → `T`               | Like `get()` but throws `RequestContextError` when no context is active.                           |
| `has`        | `has()` → `boolean`                | Whether a context is active.                                                                       |
| `getValue`   | `getValue(key)` → `T \| undefined` | Reads one key (`undefined` when absent/no context).                                                |
| `setValue`   | `setValue(key, value)`             | Writes one key. Throws when no context is active.                                                  |
| `update`     | `update(values)`                   | Merges an object into the context. Throws when no context is active.                               |
| `middleware` | `middleware(options?)`             | Express-compatible middleware (see below).                                                         |

There is intentionally **no `clear()` / `disable()`**: a context ends automatically when its `run()` callback (or request lifecycle) completes. Manual clearing would be ambiguous across concurrent async branches and hides wiring bugs. For a child scope, use a nested `run()`.

`get()` returns the **live store reference** for performance (no cloning). Treat it as read-only; mutate via `setValue()` / `update()`.

## Express integration

```ts
app.use(
  RequestContext.middleware({
    requestId: {
      header: "x-request-id", // incoming header (case-insensitive)
      generate: true, // generate when missing/invalid
      responseHeader: true, // echo back on the response (or a string name, or false)
      maxLength: 128, // incoming IDs longer than this are invalid
      trustIncoming: true, // false → always generate server-side
    },
    include: {
      method: true,
      path: true,
      ip: true,
      userAgent: true,
    },
    // Static extras or per-request derivation (e.g. after auth):
    context: (req) => ({ userId: req.user?.id }),
  }),
);
```

The middleware:

1. Reads the request ID from the configured header.
2. Validates it (non-empty, within `maxLength`, no control characters); invalid values are dropped.
3. Generates one via `crypto.randomUUID()` when needed (unless disabled).
4. Captures safe metadata: `method`, `path`, `ip`, `userAgent` (each toggleable).
5. Runs the rest of the request inside `RequestContext.run(...)`, so the context is available for the entire request lifecycle, including `await`ed services.
6. Optionally echoes the effective request ID on the response.

It **never** stores cookies, authorization headers, query strings, or request bodies. Works with Express 4 and 5 (and any `(req, res, next)`-compatible framework). Express itself is **not** a runtime dependency — the middleware uses structural typing only.

## Attaching identity after authentication

The middleware's `context` option runs **before** authentication, so `req.user` doesn't exist yet at middleware time. Attach identity later, after verification:

```ts
import { RequestContext } from "async-context-kit";

async function authenticate(req, res, next) {
  const decoded = await verifyJwt(req.headers.authorization);
  // Guard: this code also runs in seed scripts / tests with no request.
  if (RequestContext.has()) {
    RequestContext.setValue("userId", decoded.sub);
    // ...or merge several fields at once:
    // RequestContext.update({ userId: decoded.sub, tenantId: decoded.tenant });
  }
  next();
}
```

`setValue()` / `update()` throw `RequestContextError` outside a context — the `has()` guard keeps shared code (services, seed scripts, unit tests) safe. Read identity anywhere downstream with `RequestContext.getValue("userId")`, or grab a frozen copy for logging with `RequestContext.getSnapshot()`.

**Never store secrets.** The context is routinely serialized into logs and error reporters — it must never contain tokens, passwords, cookies, or full headers/bodies:

```ts
// NEVER do this:
RequestContext.setValue("token", req.headers.authorization);
RequestContext.setValue("password", req.body.password);

// Assert the discipline in your own tests:
const store = RequestContext.getSnapshot() ?? {};
expect(store).not.toHaveProperty("token");
expect(store).not.toHaveProperty("password");
expect(JSON.stringify(store)).not.toContain("Bearer ");
```

## Custom typed context

```ts
interface MyContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  roles?: string[];
}

RequestContext.run<MyContext>({ requestId: "r", roles: ["admin"] }, () => {
  const ctx = RequestContext.get<MyContext>();
  ctx?.roles; // string[] | undefined — typed
});
```

Plain `interface` declarations work without an index signature. The default shape is `RequestContextData` (with `requestId`, `userId`, `tenantId`, `method`, `path`, `ip`, `userAgent`, plus `[key: string]: unknown` for arbitrary metadata).

## Request IDs

- Generated with Node's built-in `crypto.randomUUID()` — no UUID dependency.
- Incoming IDs are **validated, not blindly trusted**: trimmed, must be `1..maxLength` chars (default `128`), must contain no ASCII control characters (blocks CR/LF header-injection). Over-long/invalid values are replaced when `generate: true`, otherwise dropped.
- Set `trustIncoming: false` to always mint server-side IDs (recommended if IDs gate security-sensitive lookups).
- Helpers are exported for custom setups: `generateRequestId()`, `isValidRequestId(value, maxLength?)`, `normalizeRequestId(value, maxLength?)`, `resolveRequestId(incoming, { generate, maxLength, trustIncoming }?)`.

## Logging examples

The package ships no logger integration (by design) — just read the context in one helper:

```ts
import { RequestContext } from "async-context-kit";

export function getLogContext() {
  const ctx = RequestContext.get();
  return { requestId: ctx?.requestId, userId: ctx?.userId };
}
```

**Pino:**

```ts
import pino from "pino";
const logger = pino({ mixin: () => getLogContext() });
// or per-request: const reqLogger = logger.child(getLogContext());
```

**Winston:**

```ts
logger.info("request completed", getLogContext());
```

**console:**

```ts
console.log("request completed", getLogContext());
```

See [`examples/logging/logging.ts`](examples/logging/logging.ts) for more.

## Async behavior & concurrent isolation

Context propagates through `async/await`, promise chains, `setTimeout`, `setImmediate`, `process.nextTick`, `Promise.all`, and nested calls — verified in [`tests/async-propagation.test.ts`](tests/async-propagation.test.ts).

Concurrent requests never see each other's data — verified with A/B/C interleaved workloads plus a 100-way fan-out in [`tests/concurrency.test.ts`](tests/concurrency.test.ts), and overlapping HTTP requests in [`tests/express.test.ts`](tests/express.test.ts).

## API reference

See [Core API](#core-apiframework-agnostic) and [Express integration](#express-integration) above, plus TypeDoc comments in [`src/`](src/). Key exports from `"async-context-kit"`:

- `RequestContext` (core + `.middleware()`)
- `RequestContextBase`, `RequestContextError`
- `createExpressMiddleware`
- `generateRequestId`, `isValidRequestId`, `normalizeRequestId`, `resolveRequestId`
- `DEFAULT_REQUEST_ID_HEADER`, `DEFAULT_MAX_REQUEST_ID_LENGTH`
- Types: `RequestContextData`, `RequestIdOptions`, `ContextIncludeOptions`, `ExpressMiddlewareOptions`, `ExpressLikeRequest`, `ExpressLikeResponse`, `ExpressLikeNext`
- Snapshot reader: `RequestContext.getSnapshot()` — frozen shallow copy for safe logging/diagnostics

## TypeScript usage

Strict-mode clean, no `any` in the public API (`unknown` where values are truly unknown). ESM (`dist/index.js`), CommonJS (`dist/index.cjs`), and declarations (`dist/index.d.ts` + `dist/index.d.cts`) are all generated; `exports` maps `import`/`require` to the correct JS bundle **and** declaration file, so CommonJS (`module: node16`) consumers typecheck with zero suppressions.

## Error behavior

| Situation                                                            | Behavior                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `get()` / `getValue()` / `getSnapshot()` / `has()` outside a context | `undefined` / `undefined` / `undefined` / `false` — safe for logging paths |
| `getOrThrow()` outside a context                                     | throws `RequestContextError`                                               |
| `setValue()` / `update()` outside a context                          | throws `RequestContextError` (silent drops would hide bugs)                |
| Throwing `context(req)` callback in middleware                       | caught; request continues with the base context                            |
| Response-header write failure                                        | caught; request continues                                                  |

## Security considerations

- **Untrusted request IDs**: validated (length-bounded, control-char-free) and optionally ignored via `trustIncoming: false`. Never use a client-supplied ID as a sole authorization key — it's spoofable by design (that's what correlation IDs are for).
- **Max length**: default `128` chars; configurable via `maxLength`. Bounds memory and header-bloat abuse.
- **No sensitive capture**: the middleware never stores cookies, `Authorization` headers, query strings, or bodies. Don't add them yourself via `context:` unless you accept the PII/secret-handling implications.
- **Mutable store**: `get()` returns a live reference. Don't hand it to untrusted code that could poison downstream reads; prefer `getValue()` for narrow access and `getSnapshot()` (frozen copy) for logging/diagnostics.
- **Memory**: the store lives only for the request/callback lifetime and is GC-eligible afterwards. Avoid stashing large objects (full DB rows, buffers) in the context.

## Performance considerations

- One `AsyncLocalStorage.run()` per request/callback plus direct store access — no cloning on read, no dependencies, no per-request allocations beyond a single shallow copy.
- `get()`/`getValue()` are O(1) property reads. A micro-benchmark lives at `examples/bench/run.mjs` (`npm run bench`); no extraordinary claims — measure in your own app.
- If you don't need metadata fields, disable them via `include: false`.

## Limitations

- Context does **not** cross process/worker-thread boundaries — propagate IDs explicitly (e.g. message headers) and re-establish with `run()`.
- Libraries that break async tracking (very old callback pools, some native modules, misuse of `als.enterWith` elsewhere) can lose context; `get()` returning `undefined` is the detectable signal — use `getOrThrow()` in strict paths.
- `run()` shallow-copies the initial object; deep mutation of a nested object passed in is shared with the caller. Pass fresh values or copy nested structures you intend to mutate.

## Node.js compatibility

Requires **Node.js >= 18** (`engines` enforced). Uses only `node:async_hooks` (`AsyncLocalStorage`) and `node:crypto` (`randomUUID`). CI tests Node 18, 20, and 22.

## Contributing

PRs welcome: keep the package tiny and dependency-free. Run `npm install`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` before submitting.

## Releasing

Publishing to npm is automated via [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which runs when a GitHub Release is published. One-time setup: add an npm granular access token (read + write for `async-context-kit`) as the `NPM_TOKEN` repository secret.

```bash
npm version patch   # or minor | major
git push --follow-tags
```

Then create a GitHub Release from the new tag — the workflow verifies the tag matches `package.json`, re-runs all quality gates, and publishes with provenance.

## License

MIT — see [LICENSE](LICENSE).
