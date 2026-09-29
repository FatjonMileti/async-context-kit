import { randomUUID } from "node:crypto";

/**
 * Default header used to read / expose the request ID.
 */
export const DEFAULT_REQUEST_ID_HEADER = "x-request-id";

/**
 * Default maximum accepted length for a client-supplied request ID.
 *
 * Rationale: a UUID is 36 chars; 128 leaves generous room for custom
 * correlation-ID formats while bounding memory use and preventing
 * header-bloat attacks.
 */
export const DEFAULT_MAX_REQUEST_ID_LENGTH = 128;

/**
 * Generate a new request ID using Node's built-in `crypto.randomUUID()`.
 * No third-party UUID dependency required (Node >= 14.17).
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Check whether a value is an acceptable incoming request ID.
 *
 * Rules:
 * - must be a string (arrays are rejected — pass a single value),
 * - trimmed length must be within `1..maxLength`,
 * - must not contain ASCII control characters (covers CR/LF
 *   splitting attempts and other header-injection payloads).
 */
export function isValidRequestId(
  value: unknown,
  maxLength: number = DEFAULT_MAX_REQUEST_ID_LENGTH,
): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (!Number.isFinite(maxLength) || maxLength <= 0) return false;
  if (trimmed.length > maxLength) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false;
  return true;
}

/**
 * Normalize a validated request ID (trim surrounding whitespace).
 * Returns `undefined` for invalid values.
 */
export function normalizeRequestId(
  value: unknown,
  maxLength: number = DEFAULT_MAX_REQUEST_ID_LENGTH,
): string | undefined {
  if (!isValidRequestId(value, maxLength)) return undefined;
  return (value as string).trim();
}

/** Options for {@link resolveRequestId}. */
export interface ResolveRequestIdOptions {
  generate?: boolean;
  maxLength?: number;
  trustIncoming?: boolean;
}

/**
 * Resolve the effective request ID for an incoming request.
 *
 * 1. If `trustIncoming !== false` and `incoming` is valid → use it (trimmed).
 * 2. Else if `generate !== false` → generate a fresh ID.
 * 3. Else → `undefined` (caller opted out of both).
 */
export function resolveRequestId(
  incoming: unknown,
  options: ResolveRequestIdOptions = {},
): string | undefined {
  const {
    generate = true,
    maxLength = DEFAULT_MAX_REQUEST_ID_LENGTH,
    trustIncoming = true,
  } = options;

  if (trustIncoming) {
    // Node lowercases headers; Express may hand us string[] for
    // repeated headers — only accept a single string value.
    const normalized = Array.isArray(incoming)
      ? undefined
      : normalizeRequestId(incoming, maxLength);
    if (normalized !== undefined) return normalized;
  }

  if (generate) return generateRequestId();
  return undefined;
}

/**
 * Extract the first header value for `name` (case-insensitive) from a
 * Node-style headers object. Returns `undefined` when absent.
 * When the header repeats (`string[]`), the first entry is used.
 */
export function getHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return undefined;
}
