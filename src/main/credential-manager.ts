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

export function getCredentials(): AwsCredentialIdentity | null {
  return resolvedCredentials;
}

export function getRegion(): string | null {
  return currentRegion;
}

export function getProfileName(): string | null {
  return currentProfile;
}

export function getSsoConfigId(): string | null {
  return currentSsoConfigId;
}

export function getSsoConfigName(): string | null {
  return currentSsoConfigName;
}

export function isConnected(): boolean {
  return resolvedCredentials !== null;
}

export function disconnect(): void {
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
