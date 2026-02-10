/**
 * @fileoverview Electron preload script. Exposes a typed API to the renderer
 * via `contextBridge.exposeInMainWorld()`. This is the only bridge between the
 * sandboxed renderer and the main process — all IPC calls are enumerated here.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  AdminConfig,
  AwsProfile,
  BedrockModel,
  ConnectionStatus,
  SsoLoginStatus,
  SsoConfiguration,
  SsoAccount,
  SsoRole,
  SendMessageParams,
  StreamEvent,
  UploadedFile,
  Conversation,
  ChatMessage,
  ToolResult,
} from '../shared/types';

const electronAPI = {
  // --- AWS Credentials ---
  listAwsProfiles: (): Promise<AwsProfile[]> =>
    ipcRenderer.invoke(IPC.AWS_LIST_PROFILES),

  connectWithProfile: (profile: string, region: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.AWS_CONNECT_PROFILE, profile, region),

  getConnectionStatus: (): Promise<ConnectionStatus> =>
    ipcRenderer.invoke(IPC.AWS_CONNECTION_STATUS),

  listModels: (): Promise<{ success: boolean; models: BedrockModel[]; error?: string }> =>
    ipcRenderer.invoke(IPC.AWS_LIST_MODELS),

  setModel: (modelId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.AWS_SET_MODEL, modelId),

  onSsoStatus: (callback: (status: SsoLoginStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SsoLoginStatus) => callback(data);
    ipcRenderer.on(IPC.AWS_SSO_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.AWS_SSO_STATUS, handler);
  },

  onSessionExpired: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.AWS_SESSION_EXPIRED, handler);
    return () => ipcRenderer.removeListener(IPC.AWS_SESSION_EXPIRED, handler);
  },

  // --- SSO Configuration Wizard ---
  listSsoConfigs: (): Promise<SsoConfiguration[]> =>
    ipcRenderer.invoke(IPC.SSO_LIST_CONFIGS),

  saveSsoConfig: (config: SsoConfiguration): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SSO_SAVE_CONFIG, config),

  deleteSsoConfig: (id: string): Promise<{ success: boolean; wasActive: boolean }> =>
    ipcRenderer.invoke(IPC.SSO_DELETE_CONFIG, id),

  startSsoDeviceAuth: (startUrl: string, region: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.SSO_START_DEVICE_AUTH, startUrl, region),

  discoverSsoAccounts: (): Promise<{ success: boolean; accounts: SsoAccount[]; error?: string }> =>
    ipcRenderer.invoke(IPC.SSO_DISCOVER_ACCOUNTS),

  discoverSsoRoles: (accountId: string): Promise<{ success: boolean; roles: SsoRole[]; error?: string }> =>
    ipcRenderer.invoke(IPC.SSO_DISCOVER_ROLES, accountId),

  connectWithSsoConfig: (configId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.SSO_CONNECT_WITH_CONFIG, configId),

  // --- Chat / Streaming ---
  sendMessage: (params: SendMessageParams): Promise<{ requestId: string }> =>
    ipcRenderer.invoke(IPC.CHAT_SEND_MESSAGE, params),

  onStreamEvent: (callback: (event: StreamEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data);
    ipcRenderer.on(IPC.CHAT_STREAM_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC.CHAT_STREAM_EVENT, handler);
  },

  abortStream: (requestId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.CHAT_ABORT_STREAM, requestId),

  // --- Tool Execution ---
  executeTool: (name: string, input: Record<string, unknown>): Promise<ToolResult> =>
    ipcRenderer.invoke(IPC.TOOL_EXECUTE, name, input),

  // --- File Operations ---
  openFileDialog: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC.FILE_OPEN_DIALOG),

  readFile: (filePath: string): Promise<UploadedFile> =>
    ipcRenderer.invoke(IPC.FILE_READ, filePath),

  // --- Conversation Store ---
  listConversations: (): Promise<Conversation[]> =>
    ipcRenderer.invoke(IPC.STORE_LIST_CONVERSATIONS),

  getConversation: (id: string): Promise<Conversation | null> =>
    ipcRenderer.invoke(IPC.STORE_GET_CONVERSATION, id),

  createConversation: (id: string, title: string): Promise<Conversation> =>
    ipcRenderer.invoke(IPC.STORE_CREATE_CONVERSATION, id, title),

  deleteConversation: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.STORE_DELETE_CONVERSATION, id),

  updateConversationTitle: (id: string, title: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.STORE_UPDATE_CONVERSATION_TITLE, id, title),

  searchConversations: (query: string): Promise<Conversation[]> =>
    ipcRenderer.invoke(IPC.STORE_SEARCH_CONVERSATIONS, query),

  saveMessage: (message: ChatMessage): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.STORE_SAVE_MESSAGE, message),

  getMessages: (conversationId: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke(IPC.STORE_GET_MESSAGES, conversationId),

  // --- Admin Config ---
  getAdminConfig: (): Promise<AdminConfig> =>
    ipcRenderer.invoke(IPC.ADMIN_CONFIG_GET),

  // --- Settings ---
  getSetting: (key: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET, key),

  setSetting: (key: string, value: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),

  wipeAllData: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SETTINGS_WIPE_DATA),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
