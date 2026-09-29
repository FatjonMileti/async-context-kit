import { RequestContextBase } from "../context.js";
import {
  DEFAULT_MAX_REQUEST_ID_LENGTH,
  DEFAULT_REQUEST_ID_HEADER,
  getHeaderValue,
  resolveRequestId,
} from "../request-id.js";
import type {
  ExpressLikeNext,
  ExpressLikeRequest,
  ExpressLikeResponse,
  ExpressMiddlewareOptions,
  RequestContextData,
} from "../types.js";

function readIncomingId(
  req: ExpressLikeRequest,
  header: string,
): string | undefined {
  // Prefer Express-style accessors when present (case-insensitive),
  // fall back to the raw headers object.
  try {
    if (typeof req.get === "function") {
      const viaGet = req.get(header);
      if (typeof viaGet === "string") return viaGet;
    }
    if (typeof req.header === "function" && req.header !== req.get) {
      const viaHeader = (
        req.header as (name: string) => string | undefined
      ).call(req, header);
      if (typeof viaHeader === "string") return viaHeader;
    }
  } catch {
    // Accessor failure must never break the request — fall through
    // to raw header parsing.
  }
  const headers = (req.headers ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  return getHeaderValue(headers, header);
}

function readMethod(req: ExpressLikeRequest): string | undefined {
  return typeof req.method === "string" ? req.method : undefined;
}

function readPath(req: ExpressLikeRequest): string | undefined {
  if (typeof req.path === "string" && req.path.length > 0) return req.path;
  const raw =
    typeof req.originalUrl === "string"
      ? req.originalUrl
      : typeof req.url === "string"
        ? req.url
        : undefined;
  if (!raw) return undefined;
  const queryIndex = raw.indexOf("?");
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
}

function readIp(req: ExpressLikeRequest): string | undefined {
  if (typeof req.ip === "string" && req.ip.length > 0) return req.ip;
  const remote = req.socket?.remoteAddress;
  return typeof remote === "string" && remote.length > 0 ? remote : undefined;
}

function readUserAgent(req: ExpressLikeRequest): string | undefined {
  const headers = (req.headers ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  return getHeaderValue(headers, "user-agent");
}

function writeResponseHeader(
  res: ExpressLikeResponse,
  name: string,
  value: string,
): void {
  try {
    if (typeof res.setHeader === "function") {
      res.setHeader(name, value);
      return;
    }
    if (typeof res.set === "function") {
      res.set(name, value);
      return;
    }
    if (typeof res.header === "function") {
      res.header(name, value);
    }
  } catch {
    // Response-header failures must never break the request.
  }
}

/**
 * Create an Express-compatible middleware that establishes a request
 * context for the entire request lifecycle.
 *
 * Behavior:
 * 1. Reads the request ID from the configured header.
 * 2. Generates one (`crypto.randomUUID()`) when missing/invalid
 *    (unless disabled / untrusted handling says otherwise).
 * 3. Captures safe metadata (`method`, `path`, `ip`, `userAgent`).
 * 4. Runs `next()` inside `RequestContext.run(...)` so the context
 *    is visible to all downstream async work for this request.
 * 5. Optionally echoes the request ID on the response.
 *
 * Never stores cookies, authorization headers, query strings, or
 * bodies. Works with Express 4 and 5 — and any framework whose
 * `(req, res, next)` triple is structurally compatible.
 */
export function createExpressMiddleware(
  options: ExpressMiddlewareOptions = {},
) {
  const requestIdOptions =
    options.requestId === false ? false : (options.requestId ?? {});
  const header =
    requestIdOptions === false
      ? undefined
      : (requestIdOptions.header ?? DEFAULT_REQUEST_ID_HEADER);
  const generate =
    requestIdOptions === false ? false : (requestIdOptions.generate ?? true);
  const responseHeader =
    requestIdOptions === false
      ? false
      : (requestIdOptions.responseHeader ?? true);
  const maxLength =
    requestIdOptions === false
      ? DEFAULT_MAX_REQUEST_ID_LENGTH
      : (requestIdOptions.maxLength ?? DEFAULT_MAX_REQUEST_ID_LENGTH);
  const trustIncoming =
    requestIdOptions === false
      ? false
      : (requestIdOptions.trustIncoming ?? true);

  const include = options.include === false ? false : (options.include ?? {});
  const includeMethod = include === false ? false : (include.method ?? true);
  const includePath = include === false ? false : (include.path ?? true);
  const includeIp = include === false ? false : (include.ip ?? true);
  const includeUserAgent =
    include === false ? false : (include.userAgent ?? true);

  const extra = options.context;

  return function requestContextMiddleware(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressLikeNext,
  ): void {
    const context: RequestContextData = {};

    if (requestIdOptions !== false && header) {
      const incoming = readIncomingId(req, header);
      const requestId = resolveRequestId(incoming, {
        generate,
        maxLength,
        trustIncoming,
      });
      if (requestId !== undefined) {
        context.requestId = requestId;
        const responseName =
          responseHeader === true
            ? header
            : typeof responseHeader === "string" && responseHeader.length > 0
              ? responseHeader
              : undefined;
        if (responseName) writeResponseHeader(res, responseName, requestId);
      }
    }

    if (includeMethod) {
      const method = readMethod(req);
      if (method) context.method = method;
    }
    if (includePath) {
      const path = readPath(req);
      if (path) context.path = path;
    }
    if (includeIp) {
      const ip = readIp(req);
      if (ip) context.ip = ip;
    }
    if (includeUserAgent) {
      const userAgent = readUserAgent(req);
      if (userAgent) context.userAgent = userAgent;
    }

    if (extra !== undefined) {
      try {
        const extraValues =
          typeof extra === "function"
            ? extra(req)
            : (extra as Record<string, unknown>);
        if (extraValues && typeof extraValues === "object") {
          Object.assign(context, extraValues);
        }
      } catch (err) {
        // A throwing `context(req)` callback must not take the
        // request down — continue with the base context and let
        // downstream handlers run.
        void err;
      }
    }

    // `next()` must be invoked synchronously inside `run()` so
    // AsyncLocalStorage binds all downstream async resources to
    // this request's store.
    RequestContextBase.run(context, () => next());
  };
}
