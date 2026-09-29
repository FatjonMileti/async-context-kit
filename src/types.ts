/**
 * Public TypeScript types for `async-context-kit`.
 *
 * The default context shape is {@link RequestContextData}. Consumers with a
 * fixed schema should define their own interface and use the generic
 * overloads, e.g. `RequestContext.get<MyContext>()`, or augment
 * `RequestContextData` via declaration merging.
 */

/** Default shape of the request-scoped context store. */
export interface RequestContextData {
  /** Correlation / request ID (populated by the Express middleware). */
  requestId?: string;
  /** Application user ID (set this yourself, e.g. after authentication). */
  userId?: string;
  /** Tenant / workspace ID for multi-tenant applications. */
  tenantId?: string;
  /** HTTP method, e.g. `"GET"` (populated by the Express middleware). */
  method?: string;
  /** Request path, e.g. `"/users"` (populated by the Express middleware). */
  path?: string;
  /** Client IP address (populated by the Express middleware). */
  ip?: string;
  /** Client user-agent (populated by the Express middleware). */
  userAgent?: string;
  /** Any additional caller-defined metadata. */
  [key: string]: unknown;
}

/** Options controlling request-ID handling in the Express middleware. */
export interface RequestIdOptions {
  /**
   * Request header to read the incoming request ID from.
   * Case-insensitive. @default "x-request-id"
   */
  header?: string;
  /**
   * Generate a new ID (via `crypto.randomUUID()`) when the incoming
   * header is missing or invalid. @default true
   */
  generate?: boolean;
  /**
   * Echo the effective request ID back on the response.
   * - `true` → use the same header name as {@link RequestIdOptions.header}.
   * - `string` → use a custom response header name.
   * - `false` → do not set a response header.
   * @default true
   */
  responseHeader?: boolean | string;
  /**
   * Maximum accepted length for an incoming request ID.
   * Longer values are treated as invalid (and replaced when
   * `generate` is enabled). @default 128
   */
  maxLength?: number;
  /**
   * Whether to trust the client-supplied request ID at all.
   * Set to `false` to always generate a fresh server-side ID
   * (useful when IDs drive security-sensitive tracing lookups).
   * @default true
   */
  trustIncoming?: boolean;
}

/** Toggles for which request metadata the middleware captures. */
export interface ContextIncludeOptions {
  /** Capture `method`. @default true */
  method?: boolean;
  /** Capture `path`. @default true */
  path?: boolean;
  /** Capture `ip`. @default true */
  ip?: boolean;
  /** Capture `userAgent`. @default true */
  userAgent?: boolean;
}

/**
 * Options for `RequestContext.middleware()`.
 *
 * The middleware never stores cookies, authorization headers, query
 * strings, or request bodies — only the safe metadata fields listed
 * in {@link RequestContextData} plus whatever you supply via `context`.
 */
export interface ExpressMiddlewareOptions {
  /**
   * Request-ID handling. Pass `false` to disable request-ID
   * handling entirely (no read, no generate, no response header).
   * @default {}
   */
  requestId?: RequestIdOptions | false;
  /**
   * Which request metadata fields to capture. Pass `false` to
   * capture none (only the request ID, if enabled).
   * @default {}
   */
  include?: ContextIncludeOptions | false;
  /**
   * Extra static values, or a function deriving extra values from
   * the current request (e.g. `userId` from `req.user` after auth).
   * Values returned here win over middleware-populated fields.
   *
   * Typed as `object` (rather than `Record<string, unknown>`) so
   * plain `interface` return types work without an index signature.
   *
   * @example
   * ```ts
   * app.use(RequestContext.middleware({
   *   context: (req) => ({ userId: req.user?.id }),
   * }));
   * ```
   */
  context?: object | ((req: ExpressLikeRequest) => object);
}

/**
 * Minimal structural request shape the middleware operates on.
 * Compatible with Express 4/5 requests (and most Express-like
 * frameworks) without requiring Express at runtime.
 */
export interface ExpressLikeRequest {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  ip?: string;
  socket?: { remoteAddress?: string | undefined } | undefined;
  get?: ((name: string) => string | undefined) | undefined;
  header?: ((name: string) => string | undefined) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Minimal structural response shape the middleware operates on. */
export interface ExpressLikeResponse {
  setHeader?: ((name: string, value: string) => void) | undefined;
  set?: ((name: string, value: string) => void) | undefined;
  header?: ((name: string, value: string) => void) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Minimal `next()` callback shape (Express-compatible). */
export type ExpressLikeNext = (err?: unknown) => void;
