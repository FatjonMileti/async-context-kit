import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContextData } from "./types.js";

/**
 * Error thrown when context is required but none is active.
 *
 * Use `RequestContext.get()` (returns `undefined` outside a context)
 * when absence is expected, and `RequestContext.getOrThrow()` when
 * absence is a programming error.
 */
export class RequestContextError extends Error {
  override name = "RequestContextError";
  constructor(message = "No active request context.") {
    super(message);
  }
}

/**
 * Module-scoped storage shared by the base class and the public
 * `RequestContext` subclass (see `src/index.ts`). Keeping it outside
 * the class guarantees a single store even across the inheritance
 * chain and avoids accidental per-subclass duplication.
 */
const storage = new AsyncLocalStorage<RequestContextData>();

/**
 * Framework-agnostic request context backed by `AsyncLocalStorage`.
 *
 * This base class implements the core API. The public `RequestContext`
 * exported from the package root extends it with framework middleware
 * (currently Express) without coupling this module to any framework:
 * there are zero runtime imports here besides Node built-ins.
 */
export class RequestContextBase {
  /** Prevent instantiation — this is a static-only API. */
  protected constructor() {}

  /**
   * Run `callback` with `context` as the active store.
   *
   * The input is shallow-copied so later mutations of the caller's
   * object do not affect the active store (and vice versa at
   * creation time). Works with sync callbacks, async functions,
   * and promises — the return value (or rejection) propagates.
   *
   * The first type parameter is the context shape, so typed
   * contexts read naturally:
   * `RequestContext.run<MyContext>({ ... }, () => { ... })`.
   *
   * Note: the context type is constrained to `object` (rather than
   * `RequestContextData`) so plain `interface` declarations work
   * without requiring an index signature.
   */
  static run<TContext extends object = RequestContextData, T = unknown>(
    context: TContext,
    callback: () => T,
  ): T {
    const store: RequestContextData = {
      ...(context as Record<string, unknown>),
    };
    return storage.run(store, callback);
  }

  /**
   * Get the active context, or `undefined` when called outside
   * `run()` / framework middleware. Returns the live store
   * reference — mutate it only via `setValue()` / `update()`.
   */
  static get<TContext extends object = RequestContextData>():
    TContext | undefined {
    return storage.getStore() as unknown as TContext | undefined;
  }

  /**
   * Get the active context, throwing a {@link RequestContextError}
   * when none is active. Prefer this in code paths where a missing
   * context indicates a wiring bug (e.g. middleware not installed).
   */
  static getOrThrow<TContext extends object = RequestContextData>(): TContext {
    const store = storage.getStore() as unknown as TContext | undefined;
    if (store === undefined) {
      throw new RequestContextError(
        "RequestContext: no active context. " +
          "Did you forget to wrap this code in RequestContext.run() " +
          "or install RequestContext.middleware()?",
      );
    }
    return store;
  }

  /** Whether a context is currently active. */
  static has(): boolean {
    return storage.getStore() !== undefined;
  }

  /**
   * Read a single key from the active context.
   * Returns `undefined` when there is no active context or the key
   * is absent.
   */
  static getValue<T = unknown>(key: string): T | undefined {
    const store = storage.getStore();
    if (store === undefined) return undefined;
    return (store as Record<string, unknown>)[key] as T | undefined;
  }

  /**
   * Write a single key on the active context.
   * @throws {RequestContextError} when no context is active.
   */
  static setValue(key: string, value: unknown): void {
    const store = storage.getStore();
    if (store === undefined) {
      throw new RequestContextError(
        `RequestContext: cannot set key "${key}" — no active context.`,
      );
    }
    (store as Record<string, unknown>)[key] = value;
  }

  /**
   * Merge `values` into the active context (like `Object.assign`).
   * @throws {RequestContextError} when no context is active.
   */
  static update(values: Record<string, unknown>): void {
    const store = storage.getStore();
    if (store === undefined) {
      throw new RequestContextError(
        "RequestContext: cannot update — no active context.",
      );
    }
    Object.assign(store, values);
  }

  // NOTE: intentionally no `clear()` / `exit()` / `disable()`.
  // AsyncLocalStorage contexts end automatically when the `run()`
  // callback (or request lifecycle) completes. A manual clear would
  // be ambiguous (clear for the current async branch only? for all
  // branches sharing the store?) and risks hiding wiring bugs.
  // If you need a child scope, use a nested `run()`.
}
