/**
 * @fileoverview URL scheme validation wrapper around Electron's
 * `shell.openExternal()`. Only allows `https:` and `http:` schemes,
 * blocking potentially dangerous protocols like `file:`, `javascript:`,
 * or custom scheme handlers that a compromised renderer could exploit.
 */

import { shell } from 'electron';

/** URL schemes considered safe for `shell.openExternal()`. */
const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

/**
 * Opens a URL in the user's default browser after validating that the
 * scheme is HTTP(S). Malformed or non-HTTP(S) URLs are silently blocked
 * and logged — all call sites are fire-and-forget so no error is thrown.
 */
export function safeOpenExternal(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn('[safeOpenExternal] Blocked malformed URL:', url);
    return;
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    console.warn('[safeOpenExternal] Blocked non-HTTP(S) URL:', url);
    return;
  }
  shell.openExternal(url);
}
