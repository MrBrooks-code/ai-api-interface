/**
 * @fileoverview Reads the IT-managed `admin-config.json` from the application's
 * resources directory. The config is read once on first access and cached in
 * memory. If the file is missing or malformed, sensible defaults are returned.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AdminConfig } from '../shared/types';

/** Fallback values used when the config file is absent or fields are invalid. */
const DEFAULT_CONFIG: AdminConfig = {
  loginBanner: {
    title: 'Bedrock Chat',
    message: 'Chat with Claude Sonnet 4.5 via Amazon Bedrock',
    titlebar: 'Bedrock Chat',
  },
  sessionDurationMinutes: 60,
};

let cachedConfig: AdminConfig | null = null;

/** Resolves the path to `admin-config.json` for packaged and development builds. */
function resolveConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'admin-config.json');
  }
  return path.join(app.getAppPath(), 'resources', 'admin-config.json');
}

/**
 * Returns the admin configuration, reading from disk on first call.
 * Individual fields are validated and fall back to defaults independently,
 * so a partial config (e.g. only `title` set) still works.
 */
export function getAdminConfig(): AdminConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = resolveConfigPath();
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const parsedDuration = parsed?.sessionDurationMinutes;
    const isValidDuration =
      typeof parsedDuration === 'number' && parsedDuration > 0 && Number.isFinite(parsedDuration);

    cachedConfig = {
      loginBanner: {
        title:
          typeof parsed?.loginBanner?.title === 'string'
            ? parsed.loginBanner.title
            : DEFAULT_CONFIG.loginBanner.title,
        message:
          typeof parsed?.loginBanner?.message === 'string'
            ? parsed.loginBanner.message
            : DEFAULT_CONFIG.loginBanner.message,
        titlebar:
          typeof parsed?.loginBanner?.titlebar === 'string'
            ? parsed.loginBanner.titlebar
            : DEFAULT_CONFIG.loginBanner.titlebar,
      },
      sessionDurationMinutes: isValidDuration
        ? parsedDuration
        : DEFAULT_CONFIG.sessionDurationMinutes,
    };
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}
