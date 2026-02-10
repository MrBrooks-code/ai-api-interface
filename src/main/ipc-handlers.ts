/**
 * @fileoverview Registers all `ipcMain.handle()` handlers that the renderer
 * calls via `ipcRenderer.invoke()`. Each handler maps an IPC channel to a
 * main-process function. This is the sole entry point for renderer-to-main
 * communication.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels';
import {
  listProfiles,
  connectWithProfile,
  connectWithSsoConfig,
  isConnected,
  getProfileName,
  getRegion,
  getSsoConfigId,
  getSsoConfigName,
  disconnect,
  startSessionTimer,
} from './credential-manager';
import { getMainWindow } from './index';
import {
  performSsoDeviceAuth,
  listSsoAccounts,
  listSsoAccountRoles,
  type DeviceAuthResult,
} from './sso-auth';
import { resetBedrockClient, listAvailableModels, setModelId, getModelId } from './bedrock-client';
import { sendMessage, abortStream } from './bedrock-stream';
import { executeTool } from './tool-executor';
import { openFileDialog, readFile } from './file-handler';
import { getAdminConfig } from './admin-config';
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  searchConversations,
  saveMessage,
  getMessages,
  listSsoConfigs,
  getSsoConfig,
  saveSsoConfig,
  deleteSsoConfig,
  getSetting,
  setSetting,
  wipeAllData,
} from './store';
import { checkRateLimit } from './ipc-rate-limiter';
import type { SsoConfiguration } from '../shared/types';

// Module-level token held securely in main process — never sent to renderer
let pendingWizardToken: DeviceAuthResult | null = null;

/** Overwrites and releases the pending wizard token (best-effort zeroization). */
function clearPendingWizardToken(): void {
  if (pendingWizardToken) {
    pendingWizardToken.accessToken = '';
    pendingWizardToken = null;
  }
}

/** Registers all IPC channel handlers. Called once during app initialization. */
export function registerIpcHandlers() {
  // --- AWS Credentials ---

  ipcMain.handle(IPC.AWS_LIST_PROFILES, async () => {
    return listProfiles();
  });

  ipcMain.handle(IPC.AWS_CONNECT_PROFILE, async (event, profile: string, region: string) => {
    if (!checkRateLimit('aws:connect', 3, 30_000)) {
      return { success: false, error: 'Rate limit exceeded — please wait before retrying' };
    }
    try {
      resetBedrockClient();
      const window = BrowserWindow.fromWebContents(event.sender);

      // Forward SSO progress to renderer so UI can show status
      await connectWithProfile(profile, region, (progress) => {
        window?.webContents.send(IPC.AWS_SSO_STATUS, progress);
      });

      const { sessionDurationMinutes } = getAdminConfig();
      startSessionTimer(sessionDurationMinutes, () => {
        clearPendingWizardToken();
        getMainWindow()?.webContents.send(IPC.AWS_SESSION_EXPIRED);
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC.AWS_CONNECTION_STATUS, () => {
    return {
      connected: isConnected(),
      profile: getProfileName(),
      region: getRegion(),
      modelId: isConnected() ? getModelId() : undefined,
      ssoConfigId: getSsoConfigId(),
      ssoConfigName: getSsoConfigName(),
    };
  });

  ipcMain.handle(IPC.AWS_LIST_MODELS, async () => {
    try {
      return { success: true, models: await listAvailableModels() };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list models';
      return { success: false, models: [], error: message };
    }
  });

  ipcMain.handle(IPC.AWS_SET_MODEL, (_event, modelId: string) => {
    setModelId(modelId);
    return { success: true };
  });

  // --- SSO Configuration Wizard ---

  ipcMain.handle(IPC.SSO_LIST_CONFIGS, () => {
    return listSsoConfigs();
  });

  ipcMain.handle(IPC.SSO_SAVE_CONFIG, (_event, config: SsoConfiguration) => {
    saveSsoConfig(config);
    return { success: true };
  });

  ipcMain.handle(IPC.SSO_DELETE_CONFIG, (_event, id: string) => {
    // If the deleted config is the active connection, disconnect first
    // to zeroize credentials and prevent a stale session (security).
    const wasActive = getSsoConfigId() === id;
    deleteSsoConfig(id);
    if (wasActive) {
      clearPendingWizardToken();
      disconnect();
    }
    return { success: true, wasActive };
  });

  ipcMain.handle(IPC.SSO_START_DEVICE_AUTH, async (event, startUrl: string, region: string) => {
    if (!checkRateLimit('sso:device-auth', 3, 30_000)) {
      return { success: false, error: 'Rate limit exceeded — please wait before retrying' };
    }
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await performSsoDeviceAuth(startUrl, region, (progress) => {
        window?.webContents.send(IPC.AWS_SSO_STATUS, progress);
      });
      // Store token in main process only — never send to renderer
      pendingWizardToken = result;
      return { success: true };
    } catch (err) {
      pendingWizardToken = null;
      const message = err instanceof Error ? err.message : 'SSO device auth failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC.SSO_DISCOVER_ACCOUNTS, async () => {
    if (!pendingWizardToken || pendingWizardToken.expiresAt <= Date.now()) {
      return { success: false, error: 'No valid SSO token — please authenticate first', accounts: [] };
    }
    try {
      const accounts = await listSsoAccounts(
        pendingWizardToken.accessToken,
        pendingWizardToken.region
      );
      return { success: true, accounts };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list accounts';
      return { success: false, error: message, accounts: [] };
    }
  });

  ipcMain.handle(IPC.SSO_DISCOVER_ROLES, async (_event, accountId: string) => {
    if (!pendingWizardToken || pendingWizardToken.expiresAt <= Date.now()) {
      return { success: false, error: 'No valid SSO token — please authenticate first', roles: [] };
    }
    try {
      const roles = await listSsoAccountRoles(
        pendingWizardToken.accessToken,
        pendingWizardToken.region,
        accountId
      );
      return { success: true, roles };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list roles';
      return { success: false, error: message, roles: [] };
    }
  });

  ipcMain.handle(IPC.SSO_CONNECT_WITH_CONFIG, async (event, configId: string) => {
    if (!checkRateLimit('sso:connect', 3, 30_000)) {
      return { success: false, error: 'Rate limit exceeded — please wait before retrying' };
    }
    try {
      const config = getSsoConfig(configId);
      if (!config) {
        return { success: false, error: 'SSO configuration not found' };
      }
      resetBedrockClient();
      const window = BrowserWindow.fromWebContents(event.sender);
      await connectWithSsoConfig(config, (progress) => {
        window?.webContents.send(IPC.AWS_SSO_STATUS, progress);
      });

      const { sessionDurationMinutes } = getAdminConfig();
      startSessionTimer(sessionDurationMinutes, () => {
        clearPendingWizardToken();
        getMainWindow()?.webContents.send(IPC.AWS_SESSION_EXPIRED);
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSO connection failed';
      return { success: false, error: message };
    }
  });

  // --- Chat / Streaming ---

  ipcMain.handle(IPC.CHAT_SEND_MESSAGE, async (event, params) => {
    if (!checkRateLimit('chat:send', 10, 10_000)) {
      return { requestId: '', error: 'Rate limit exceeded — please slow down' };
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window found');
    const requestId = await sendMessage(params, window);
    return { requestId };
  });

  ipcMain.handle(IPC.CHAT_ABORT_STREAM, (_event, requestId: string) => {
    return { success: abortStream(requestId) };
  });

  // --- Tool Execution ---

  ipcMain.handle(IPC.TOOL_EXECUTE, async (_event, name: string, input: Record<string, unknown>) => {
    if (!checkRateLimit('tool:execute', 20, 10_000)) {
      return { error: 'Rate limit exceeded — please slow down' };
    }
    return executeTool(name, input);
  });

  // --- File Operations ---

  ipcMain.handle(IPC.FILE_OPEN_DIALOG, async () => {
    return openFileDialog();
  });

  ipcMain.handle(IPC.FILE_READ, async (_event, filePath: string) => {
    if (!checkRateLimit('file:read', 30, 10_000)) {
      return { error: 'Rate limit exceeded — please slow down' };
    }
    return readFile(filePath);
  });

  // --- Conversation Store ---

  ipcMain.handle(IPC.STORE_LIST_CONVERSATIONS, () => {
    return listConversations();
  });

  ipcMain.handle(IPC.STORE_GET_CONVERSATION, (_event, id: string) => {
    return getConversation(id);
  });

  ipcMain.handle(IPC.STORE_CREATE_CONVERSATION, (_event, id: string, title: string) => {
    return createConversation(id, title);
  });

  ipcMain.handle(IPC.STORE_DELETE_CONVERSATION, (_event, id: string) => {
    deleteConversation(id);
    return { success: true };
  });

  ipcMain.handle(IPC.STORE_UPDATE_CONVERSATION_TITLE, (_event, id: string, title: string) => {
    updateConversationTitle(id, title);
    return { success: true };
  });

  ipcMain.handle(IPC.STORE_SEARCH_CONVERSATIONS, (_event, query: string) => {
    return searchConversations(query);
  });

  ipcMain.handle(IPC.STORE_SAVE_MESSAGE, (_event, message) => {
    saveMessage(message);
    return { success: true };
  });

  ipcMain.handle(IPC.STORE_GET_MESSAGES, (_event, conversationId: string) => {
    return getMessages(conversationId);
  });

  // --- Admin Config ---

  ipcMain.handle(IPC.ADMIN_CONFIG_GET, () => {
    return getAdminConfig();
  });

  // --- Settings ---

  ipcMain.handle(IPC.SETTINGS_GET, (_event, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle(IPC.SETTINGS_SET, (_event, key: string, value: string) => {
    setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle(IPC.SETTINGS_WIPE_DATA, () => {
    wipeAllData();
    return { success: true };
  });
}
