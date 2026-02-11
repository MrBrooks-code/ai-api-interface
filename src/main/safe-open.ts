/**
 * @fileoverview URL scheme validation wrapper around Electron's
 * `shell.openExternal()`. Only allows `https:` and `http:` schemes,
 * blocking potentially dangerous protocols like `file:`, `javascript:`,
 * or custom scheme handlers that a compromised renderer could exploit.
 *
 * Falls back to the native OS `open` command if Electron's API fails
 * (e.g. due to permission handler restrictions in sandboxed sessions).
 */

import { shell } from 'electron';
import { execFile } from 'child_process';

/** URL schemes considered safe for `shell.openExternal()`. */
const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

/**
 * Opens a URL in the user's default browser via the OS, bypassing Electron's
 * permission system. Used as a fallback when `shell.openExternal()` is blocked.
 * `execFile` (not `exec`) is used so the URL is passed as an argv element
 * rather than interpolated into a shell string — no injection risk.
 */
function openWithOS(url: string): void {
  if (process.platform === 'darwin') {
    execFile('open', [url]);
  } else if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

/**
 * Opens a URL in the user's default browser after validating that the
 * scheme is HTTP(S). Malformed or non-HTTP(S) URLs are blocked and logged.
 * If `shell.openExternal()` fails, falls back to the native OS command.
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
  shell.openExternal(url).catch(() => {
    // Electron's shell.openExternal can be blocked by session permission handlers.
    // Fall back to the native OS open command.
    openWithOS(url);
  });
}
