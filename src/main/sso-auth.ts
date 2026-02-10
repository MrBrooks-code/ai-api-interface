/**
 * @fileoverview AWS SSO (IAM Identity Center) device authorization flow and
 * token caching. Implements OIDC device auth per the AWS SSO specification:
 * RegisterClient → StartDeviceAuthorization → poll CreateToken → cache.
 * Tokens are cached to `~/.aws/sso/cache/` with `0o600` permissions,
 * matching the AWS CLI convention.
 */

import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from '@aws-sdk/client-sso-oidc';
import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
  GetRoleCredentialsCommand,
} from '@aws-sdk/client-sso';
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'node:https';
import { safeOpenExternal } from './safe-open';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Shared HTTPS agent enforcing TLS 1.2+ for all SSO/OIDC SDK clients
 * (addresses SC-F03).
 */
const tlsHandler = new NodeHttpHandler({
  httpsAgent: new https.Agent({ minVersion: 'TLSv1.2' }),
});
import type { SsoAccount, SsoRole } from '../shared/types';

export interface SsoConfig {
  ssoStartUrl: string;
  ssoRegion: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  ssoSessionName?: string;
  ssoRegistrationScopes?: string;
}

export interface SsoLoginProgress {
  stage: 'registering' | 'authorizing' | 'polling' | 'complete' | 'error';
  verificationUri?: string;
  userCode?: string;
  error?: string;
}

/**
 * Parse SSO configuration from a profile in ~/.aws/config.
 * Supports both legacy (inline sso_*) and modern (sso_session reference) formats.
 */
export async function getSsoConfigForProfile(profileName: string): Promise<SsoConfig | null> {
  const configFiles = await loadSharedConfigFiles();
  const profileConfig = configFiles.configFile?.[profileName];
  if (!profileConfig) return null;

  // Modern format: profile references an sso_session block
  if (profileConfig.sso_session) {
    const sessionName = profileConfig.sso_session;
    const sessionConfig = configFiles.configFile?.[`sso-session ${sessionName}`];
    if (sessionConfig?.sso_start_url && sessionConfig?.sso_region) {
      return {
        ssoStartUrl: sessionConfig.sso_start_url,
        ssoRegion: sessionConfig.sso_region,
        ssoAccountId: profileConfig.sso_account_id,
        ssoRoleName: profileConfig.sso_role_name,
        ssoSessionName: sessionName,
        ssoRegistrationScopes: sessionConfig.sso_registration_scopes,
      };
    }
  }

  // Legacy format: sso_* fields directly on the profile
  if (profileConfig.sso_start_url && profileConfig.sso_region) {
    return {
      ssoStartUrl: profileConfig.sso_start_url,
      ssoRegion: profileConfig.sso_region,
      ssoAccountId: profileConfig.sso_account_id,
      ssoRoleName: profileConfig.sso_role_name,
    };
  }

  return null;
}

/**
 * Check if a profile is SSO-based.
 */
export async function isSsoProfile(profileName: string): Promise<boolean> {
  const config = await getSsoConfigForProfile(profileName);
  return config !== null;
}

/**
 * Get the SSO token cache path for a given session or start URL.
 */
function getSsoCachePath(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex');
  return path.join(os.homedir(), '.aws', 'sso', 'cache', `${hash}.json`);
}

/**
 * Check if a cached SSO token exists and is still valid.
 */
export function hasCachedSsoToken(ssoConfig: SsoConfig): boolean {
  const cacheKey = ssoConfig.ssoSessionName ?? ssoConfig.ssoStartUrl;
  const cachePath = getSsoCachePath(cacheKey);
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (!data.accessToken || !data.expiresAt) return false;
    return new Date(data.expiresAt).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Run the full SSO device authorization flow:
 * 1. RegisterClient with OIDC
 * 2. StartDeviceAuthorization → get browser URL + user code
 * 3. Open browser for user to authenticate
 * 4. Poll CreateToken until user completes auth
 * 5. Cache the token to ~/.aws/sso/cache/
 *
 * The onProgress callback is called at each stage so the UI can display status.
 */
export async function performSsoLogin(
  ssoConfig: SsoConfig,
  onProgress: (progress: SsoLoginProgress) => void
): Promise<void> {
  const oidcClient = new SSOOIDCClient({ region: ssoConfig.ssoRegion, requestHandler: tlsHandler });

  // 1. Register client
  onProgress({ stage: 'registering' });
  const scopes = ssoConfig.ssoRegistrationScopes
    ? ssoConfig.ssoRegistrationScopes.split(',').map((s) => s.trim())
    : ['sso:account:access'];

  const registerResp = await oidcClient.send(
    new RegisterClientCommand({
      clientName: 'bedrock-chat',
      clientType: 'public',
      scopes,
    })
  );

  if (!registerResp.clientId || !registerResp.clientSecret) {
    throw new Error('SSO OIDC RegisterClient did not return clientId/clientSecret');
  }

  // 2. Start device authorization
  onProgress({ stage: 'authorizing' });
  const authResp = await oidcClient.send(
    new StartDeviceAuthorizationCommand({
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      startUrl: ssoConfig.ssoStartUrl,
    })
  );

  if (!authResp.deviceCode || !authResp.verificationUriComplete) {
    throw new Error('SSO OIDC StartDeviceAuthorization did not return expected fields');
  }

  const verificationUri = authResp.verificationUriComplete;
  const userCode = authResp.userCode ?? '';
  const pollInterval = (authResp.interval ?? 5) * 1000; // convert to ms

  onProgress({ stage: 'polling', verificationUri, userCode });

  // 3. Open browser
  safeOpenExternal(verificationUri);

  // 4. Poll for token
  const expiresAt = Date.now() + (authResp.expiresIn ?? 600) * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    try {
      const tokenResp = await oidcClient.send(
        new CreateTokenCommand({
          clientId: registerResp.clientId,
          clientSecret: registerResp.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: authResp.deviceCode,
        })
      );

      if (tokenResp.accessToken) {
        // 5. Cache the token
        const cacheKey = ssoConfig.ssoSessionName ?? ssoConfig.ssoStartUrl;
        const cachePath = getSsoCachePath(cacheKey);

        const cacheDir = path.dirname(cachePath);
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });

        const tokenExpiresAt = new Date(
          Date.now() + (tokenResp.expiresIn ?? 3600) * 1000
        ).toISOString();

        const cacheData = {
          accessToken: tokenResp.accessToken,
          expiresAt: tokenExpiresAt,
          region: ssoConfig.ssoRegion,
          startUrl: ssoConfig.ssoStartUrl,
        };

        fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), { encoding: 'utf-8', mode: 0o600 });

        onProgress({ stage: 'complete' });
        return;
      }
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      // authorization_pending and slow_down are expected while waiting
      if (name === 'AuthorizationPendingException') {
        continue;
      }
      if (name === 'SlowDownException') {
        await sleep(pollInterval); // extra wait
        continue;
      }
      // Anything else is a real error
      throw err;
    }
  }

  throw new Error('SSO login timed out — user did not complete browser authorization');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- SSO Device Auth for Wizard ---

export interface DeviceAuthResult {
  accessToken: string;
  expiresAt: number; // epoch ms
  region: string;
  startUrl: string;
}

/** In-memory token cache keyed by startUrl */
const tokenCache = new Map<string, DeviceAuthResult>();

/**
 * Overwrites cached SSO access tokens with empty strings and clears the
 * in-memory token cache. Called on disconnect to prevent stale tokens from
 * lingering in the V8 heap (best-effort zeroization — see SI-F05).
 */
export function clearTokenCache(): void {
  for (const entry of tokenCache.values()) {
    entry.accessToken = '';
  }
  tokenCache.clear();
}

/**
 * Read a cached SSO token from ~/.aws/sso/cache/ and return structured data.
 */
export function readCachedToken(startUrl: string): DeviceAuthResult | null {
  const cachePath = getSsoCachePath(startUrl);
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (!data.accessToken || !data.expiresAt) return null;
    const expiresAt = new Date(data.expiresAt).getTime();
    if (expiresAt <= Date.now()) return null;
    return {
      accessToken: data.accessToken,
      expiresAt,
      region: data.region ?? '',
      startUrl: data.startUrl ?? startUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Perform SSO device auth flow for the wizard.
 * Checks memory cache → file cache → full device auth.
 * Returns a DeviceAuthResult with the access token.
 */
export async function performSsoDeviceAuth(
  startUrl: string,
  region: string,
  onProgress: (progress: SsoLoginProgress) => void
): Promise<DeviceAuthResult> {
  // Check memory cache
  const cached = tokenCache.get(startUrl);
  if (cached && cached.expiresAt > Date.now()) {
    onProgress({ stage: 'complete' });
    return cached;
  }

  // Check file cache
  const fileCached = readCachedToken(startUrl);
  if (fileCached) {
    tokenCache.set(startUrl, fileCached);
    onProgress({ stage: 'complete' });
    return fileCached;
  }

  // Full device auth flow (reuses same OIDC pattern as performSsoLogin)
  const oidcClient = new SSOOIDCClient({ region, requestHandler: tlsHandler });

  onProgress({ stage: 'registering' });
  const registerResp = await oidcClient.send(
    new RegisterClientCommand({
      clientName: 'bedrock-chat',
      clientType: 'public',
      scopes: ['sso:account:access'],
    })
  );

  if (!registerResp.clientId || !registerResp.clientSecret) {
    throw new Error('SSO OIDC RegisterClient did not return clientId/clientSecret');
  }

  onProgress({ stage: 'authorizing' });
  const authResp = await oidcClient.send(
    new StartDeviceAuthorizationCommand({
      clientId: registerResp.clientId,
      clientSecret: registerResp.clientSecret,
      startUrl,
    })
  );

  if (!authResp.deviceCode || !authResp.verificationUriComplete) {
    throw new Error('SSO OIDC StartDeviceAuthorization did not return expected fields');
  }

  const verificationUri = authResp.verificationUriComplete;
  const userCode = authResp.userCode ?? '';
  const pollInterval = (authResp.interval ?? 5) * 1000;

  onProgress({ stage: 'polling', verificationUri, userCode });
  safeOpenExternal(verificationUri);

  const expiresAt = Date.now() + (authResp.expiresIn ?? 600) * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    try {
      const tokenResp = await oidcClient.send(
        new CreateTokenCommand({
          clientId: registerResp.clientId,
          clientSecret: registerResp.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: authResp.deviceCode,
        })
      );

      if (tokenResp.accessToken) {
        const tokenExpiresAt = Date.now() + (tokenResp.expiresIn ?? 3600) * 1000;

        // Cache to file
        const cachePath = getSsoCachePath(startUrl);
        const cacheDir = path.dirname(cachePath);
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(
          cachePath,
          JSON.stringify(
            {
              accessToken: tokenResp.accessToken,
              expiresAt: new Date(tokenExpiresAt).toISOString(),
              region,
              startUrl,
            },
            null,
            2
          ),
          { encoding: 'utf-8', mode: 0o600 }
        );

        const result: DeviceAuthResult = {
          accessToken: tokenResp.accessToken,
          expiresAt: tokenExpiresAt,
          region,
          startUrl,
        };

        tokenCache.set(startUrl, result);
        onProgress({ stage: 'complete' });
        return result;
      }
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === 'AuthorizationPendingException') continue;
      if (name === 'SlowDownException') {
        await sleep(pollInterval);
        continue;
      }
      throw err;
    }
  }

  throw new Error('SSO login timed out — user did not complete browser authorization');
}

/**
 * List all accounts accessible with the given SSO token.
 */
export async function listSsoAccounts(
  accessToken: string,
  ssoRegion: string
): Promise<SsoAccount[]> {
  const client = new SSOClient({ region: ssoRegion, requestHandler: tlsHandler });
  const accounts: SsoAccount[] = [];
  let nextToken: string | undefined;

  do {
    const resp = await client.send(
      new ListAccountsCommand({ accessToken, nextToken })
    );
    for (const acct of resp.accountList ?? []) {
      accounts.push({
        accountId: acct.accountId ?? '',
        accountName: acct.accountName ?? '',
        emailAddress: acct.emailAddress,
      });
    }
    nextToken = resp.nextToken;
  } while (nextToken);

  return accounts;
}

/**
 * List all roles for a specific account accessible with the given SSO token.
 */
export async function listSsoAccountRoles(
  accessToken: string,
  ssoRegion: string,
  accountId: string
): Promise<SsoRole[]> {
  const client = new SSOClient({ region: ssoRegion, requestHandler: tlsHandler });
  const roles: SsoRole[] = [];
  let nextToken: string | undefined;

  do {
    const resp = await client.send(
      new ListAccountRolesCommand({ accessToken, accountId, nextToken })
    );
    for (const role of resp.roleList ?? []) {
      roles.push({
        roleName: role.roleName ?? '',
        accountId,
      });
    }
    nextToken = resp.nextToken;
  } while (nextToken);

  return roles;
}

/**
 * Get temporary AWS credentials for a specific account and role.
 */
export async function getSsoRoleCredentials(
  accessToken: string,
  ssoRegion: string,
  accountId: string,
  roleName: string
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: number }> {
  const client = new SSOClient({ region: ssoRegion, requestHandler: tlsHandler });
  const resp = await client.send(
    new GetRoleCredentialsCommand({ accessToken, accountId, roleName })
  );

  const creds = resp.roleCredentials;
  if (!creds?.accessKeyId || !creds.secretAccessKey || !creds.sessionToken) {
    throw new Error('GetRoleCredentials did not return valid credentials');
  }

  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    expiration: creds.expiration ?? 0,
  };
}
