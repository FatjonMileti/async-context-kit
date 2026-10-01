import { RequestContextBase, RequestContextError } from "./context.js";
import { createExpressMiddleware } from "./middleware/express.js";
import {
  DEFAULT_MAX_REQUEST_ID_LENGTH,
  DEFAULT_REQUEST_ID_HEADER,
  generateRequestId,
  isValidRequestId,
  normalizeRequestId,
  resolveRequestId,
} from "./request-id.js";
import type {
  ContextIncludeOptions,
  ExpressLikeNext,
  ExpressLikeRequest,
  ExpressLikeResponse,
  ExpressMiddlewareOptions,
  RequestContextData,
  RequestIdOptions,
} from "./types.js";

/**
 * Public entry point — request-scoped context backed by
 * `AsyncLocalStorage`, plus framework middleware.
 *
 * @example
 * ```ts
 * import { RequestContext } from "async-context-kit";
 *
 * RequestContext.run({ requestId: "123" }, async () => {
 *   console.log(RequestContext.get()?.requestId); // "123"
 * });
 * ```
 */
export class RequestContext extends RequestContextBase {
  /**
   * Express-compatible middleware. See {@link ExpressMiddlewareOptions}.
   *
   * @example
   * ```ts
   * app.use(RequestContext.middleware({
   *   requestId: { header: "x-request-id", generate: true, responseHeader: true },
   * }));
   * ```
   */
  static middleware = createExpressMiddleware;
}

export {
  RequestContextBase,
  RequestContextError,
  createExpressMiddleware,
  DEFAULT_MAX_REQUEST_ID_LENGTH,
  DEFAULT_REQUEST_ID_HEADER,
  generateRequestId,
  isValidRequestId,
  normalizeRequestId,
  resolveRequestId,
};

export type {
  ContextIncludeOptions,
  ExpressLikeNext,
  ExpressLikeRequest,
  ExpressLikeResponse,
  ExpressMiddlewareOptions,
  RequestContextData,
  RequestIdOptions,
};
