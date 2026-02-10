import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AdminConfig } from '../shared/types';

const DEFAULT_CONFIG: AdminConfig = {
  loginBanner: {
    title: 'Bedrock Chat',
    message: 'Chat with Claude Sonnet 4.5 via Amazon Bedrock',
  },
};

let cachedConfig: AdminConfig | null = null;

function resolveConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'admin-config.json');
  }
  return path.join(app.getAppPath(), 'resources', 'admin-config.json');
}

export function getAdminConfig(): AdminConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = resolveConfigPath();
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

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
      },
    };
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}
