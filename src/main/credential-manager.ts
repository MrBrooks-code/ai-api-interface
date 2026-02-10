/**
 * @fileoverview AWS credential resolution and session state. Credentials are
 * held exclusively in this module's closure — they are never serialized or
 * sent to the renderer process. Supports connection via local AWS profiles
 * (SSO or static) and saved SSO configurations.
 */

import { fromIni, fromSSO } from '@aws-sdk/credential-providers';
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import type { AwsProfile } from '../shared/types';
import type { SsoConfiguration } from '../shared/types';
import {
  getSsoConfigForProfile,
  hasCachedSsoToken,
  performSsoLogin,
  performSsoDeviceAuth,
  getSsoRoleCredentials,
  type SsoLoginProgress,
} from './sso-auth';

let resolvedCredentials: AwsCredentialIdentity | null = null;
let currentProfile: string | null = null;
let currentRegion: string | null = null;
let currentSsoConfigId: string | null = null;
let currentSsoConfigName: string | null = null;
let sessionTimer: NodeJS.Timeout | null = null;

/**
 * Discovers AWS profiles from `~/.aws/config` and `~/.aws/credentials`.
 * Each profile is annotated with whether it uses SSO and whether a cached
 * SSO token is available.
 */
export async function listProfiles(): Promise<AwsProfile[]> {
  try {
    const configFiles = await loadSharedConfigFiles();
    const profileNames = new Set<string>();

    if (configFiles.credentialsFile) {
      for (const name of Object.keys(configFiles.credentialsFile)) {
        profileNames.add(name);
      }
    }

    if (configFiles.configFile) {
      for (const name of Object.keys(configFiles.configFile)) {
        // Skip sso-session blocks — they're not profiles
        if (name.startsWith('sso-session ')) continue;
        profileNames.add(name);
      }
    }

    const profiles: AwsProfile[] = [];
    for (const name of profileNames) {
      const configEntry = configFiles.configFile?.[name];
      const ssoConfig = await getSsoConfigForProfile(name);
      const isSso = ssoConfig !== null;
      profiles.push({
        name,
        region: configEntry?.region,
        isSso,
        ssoTokenValid: isSso ? hasCachedSsoToken(ssoConfig!) : undefined,
      });
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Connect using an AWS profile. For SSO profiles, this will:
 * 1. Check for a valid cached token
 * 2. If expired/missing, run the device authorization flow (opens browser)
 * 3. Use fromSSO() to resolve credentials from the token
 *
 * The onSsoProgress callback lets the UI show SSO login status.
 */
export async function connectWithProfile(
  profile: string,
  region: string,
  onSsoProgress?: (progress: SsoLoginProgress) => void
): Promise<void> {
  clearSessionTimer();
  const ssoConfig = await getSsoConfigForProfile(profile);

  if (ssoConfig) {
    // SSO profile — check if we need to login first
    if (!hasCachedSsoToken(ssoConfig)) {
      // Token expired or missing — run device auth flow
      await performSsoLogin(ssoConfig, onSsoProgress ?? (() => {}));
    }

    // Now resolve credentials using the cached SSO token
    const credentialProvider = fromSSO({ profile });
    resolvedCredentials = await credentialProvider();
  } else {
    // Standard profile (static keys, assume role, etc.)
    const credentialProvider = fromIni({ profile });
    resolvedCredentials = await credentialProvider();
  }

  currentProfile = profile;
  currentRegion = region;
}

/**
 * Connect using a saved SSO configuration.
 * Performs device auth if needed, then gets role credentials.
 */
export async function connectWithSsoConfig(
  config: SsoConfiguration,
  onSsoProgress?: (progress: SsoLoginProgress) => void
): Promise<void> {
  clearSessionTimer();
  if (!config.accountId || !config.roleName) {
    throw new Error('SSO config is missing accountId or roleName');
  }

  const authResult = await performSsoDeviceAuth(
    config.ssoStartUrl,
    config.ssoRegion,
    onSsoProgress ?? (() => {})
  );

  const creds = await getSsoRoleCredentials(
    authResult.accessToken,
    config.ssoRegion,
    config.accountId,
    config.roleName
  );

  resolvedCredentials = {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  };

  currentProfile = null;
  currentRegion = config.bedrockRegion;
  currentSsoConfigId = config.id;
  currentSsoConfigName = config.name;
}

/** Returns the currently resolved credentials, or `null` if not connected. */
export function getCredentials(): AwsCredentialIdentity | null {
  return resolvedCredentials;
}

/** Returns the AWS region for the active connection. */
export function getRegion(): string | null {
  return currentRegion;
}

/** Returns the AWS profile name used for the active connection, if any. */
export function getProfileName(): string | null {
  return currentProfile;
}

/** Returns the saved SSO configuration ID used for the active connection, if any. */
export function getSsoConfigId(): string | null {
  return currentSsoConfigId;
}

/** Returns the display name of the saved SSO configuration, if any. */
export function getSsoConfigName(): string | null {
  return currentSsoConfigName;
}

/** Returns `true` if credentials have been resolved and are held in memory. */
export function isConnected(): boolean {
  return resolvedCredentials !== null;
}

/**
 * Clears the active session. Credential values are overwritten with empty
 * strings before the reference is released (best-effort zeroization for
 * defense-in-depth — see SI-F02 in SECURITY-REVIEW.MD).
 */
export function disconnect(): void {
  clearSessionTimer();
  if (resolvedCredentials) {
    // Overwrite credential values before clearing reference (best-effort zeroization).
    // Cast needed because AwsCredentialIdentity fields are readonly.
    const creds = resolvedCredentials as { -readonly [K in keyof AwsCredentialIdentity]: AwsCredentialIdentity[K] };
    creds.accessKeyId = '';
    creds.secretAccessKey = '';
    if (creds.sessionToken) {
      creds.sessionToken = '';
    }
  }
  resolvedCredentials = null;
  currentProfile = null;
  currentRegion = null;
  currentSsoConfigId = null;
  currentSsoConfigName = null;
}

/**
 * Starts a timer that auto-disconnects after the given duration.
 * When the timer fires, credentials are zeroized via {@link disconnect}
 * and the provided callback is invoked so the renderer can be notified.
 */
export function startSessionTimer(durationMinutes: number, onExpired: () => void): void {
  clearSessionTimer();
  sessionTimer = setTimeout(() => {
    sessionTimer = null;
    disconnect();
    onExpired();
  }, durationMinutes * 60 * 1000);
}

/** Cancels the session-duration timer if one is running. */
export function clearSessionTimer(): void {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
}
