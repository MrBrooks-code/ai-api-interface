/**
 * @fileoverview Reads the IT-managed `admin-config.json` from the application's
 * resources directory. The config is read once on first access and cached in
 * memory. If the file is missing or malformed, sensible defaults are returned.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AdminConfig, BuiltInThemeId, CustomThemeConfig, ThemeColors } from '../shared/types';

/** Fallback values used when the config file is absent or fields are invalid. */
const DEFAULT_CONFIG: AdminConfig = {
  loginBanner: {
    title: 'Bedrock Chat',
    message: 'Chat with Claude Sonnet 4.5 via Amazon Bedrock',
    titlebar: 'Bedrock Chat',
  },
  sessionDurationMinutes: 60,
};

/** The 7 built-in theme IDs, used to validate `baseTheme`. */
const BUILT_IN_THEME_IDS: BuiltInThemeId[] = [
  'catppuccin-mocha', 'catppuccin-latte', 'nord', 'tokyo-night',
  'rose-pine', 'gruvbox-dark', 'solarized-light',
];

/** Valid camelCase keys for {@link ThemeColors}. */
const THEME_COLOR_KEYS: (keyof ThemeColors)[] = [
  'surface', 'surfaceLight', 'surfaceLighter',
  'primary', 'primaryHover',
  'text', 'textMuted', 'textDim',
  'accentGreen', 'accentRed', 'accentYellow', 'accentPeach',
  'codeBg', 'scrollbarThumb', 'scrollbarThumbHover',
];

/** Returns `true` if `value` is a valid 3- or 6-digit hex color (e.g. `#abc` or `#aabbcc`). */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Infers a MIME type from a file extension for use in a data URI. */
function mimeForExt(ext: string): string | null {
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  return map[ext.toLowerCase()] ?? null;
}

/**
 * Parses and validates the `customTheme` section from the raw config JSON.
 * Invalid fields are silently dropped; a missing `name` causes the entire
 * section to be skipped.
 */
function parseCustomTheme(raw: unknown, resourcesDir: string): CustomThemeConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  // name is required
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return undefined;

  const config: CustomThemeConfig = { name: obj.name.trim() };

  // baseTheme — must be a built-in ID
  if (typeof obj.baseTheme === 'string' && BUILT_IN_THEME_IDS.includes(obj.baseTheme as BuiltInThemeId)) {
    config.baseTheme = obj.baseTheme as BuiltInThemeId;
  }

  // colors — validate each key individually
  if (typeof obj.colors === 'object' && obj.colors !== null) {
    const rawColors = obj.colors as Record<string, unknown>;
    const validColors: ThemeColors = {};
    let hasAny = false;
    for (const key of THEME_COLOR_KEYS) {
      if (isHexColor(rawColors[key])) {
        (validColors as Record<string, string>)[key] = rawColors[key] as string;
        hasAny = true;
      }
    }
    if (hasAny) config.colors = validColors;
  }

  // logoPath — read file, validate size, convert to base64 data URI
  if (typeof obj.logoPath === 'string' && obj.logoPath.length > 0) {
    config.logoPath = obj.logoPath;
    try {
      const logoFullPath = path.join(resourcesDir, obj.logoPath);
      const stat = fs.statSync(logoFullPath);
      if (stat.size <= 1_048_576) {
        const ext = path.extname(obj.logoPath);
        const mime = mimeForExt(ext);
        if (mime) {
          const bytes = fs.readFileSync(logoFullPath);
          config.logo = `data:${mime};base64,${bytes.toString('base64')}`;
        }
      }
    } catch {
      // Missing or unreadable logo — silently skip
    }
  }

  return config;
}

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

    const resourcesDir = path.dirname(configPath);

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
      customTheme: parseCustomTheme(parsed?.customTheme, resourcesDir),
    };
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}
