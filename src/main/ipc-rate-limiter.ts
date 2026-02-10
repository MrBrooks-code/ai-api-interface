/**
 * @fileoverview Per-channel sliding-window rate limiter for IPC handlers.
 * Prevents a compromised or malfunctioning renderer from flooding the main
 * process with expensive operations (Bedrock API calls, auth flows, etc.).
 */

/** Sliding window of request timestamps keyed by logical channel name. */
const windows = new Map<string, number[]>();

/**
 * Checks whether a request on `channel` is within the allowed rate.
 * Returns `true` if the request is allowed, `false` if it exceeds the limit.
 *
 * @param channel - Logical name for the rate-limit bucket (e.g. `'chat:send'`).
 * @param maxRequests - Maximum number of requests allowed within the window.
 * @param windowMs - Sliding window duration in milliseconds.
 */
export function checkRateLimit(
  channel: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const timestamps = windows.get(channel) ?? [];

  // Evict entries outside the window
  const cutoff = now - windowMs;
  const recent = timestamps.filter((t) => t > cutoff);

  if (recent.length >= maxRequests) {
    return false;
  }

  recent.push(now);
  windows.set(channel, recent);
  return true;
}
