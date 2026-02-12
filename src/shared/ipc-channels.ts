/**
 * @fileoverview IPC channel name constants shared between main, preload, and
 * renderer processes. Every Electron IPC call references a channel from this
 * map to prevent string-literal drift across the process boundary.
 */

/**
 * Exhaustive map of IPC channel names used by `ipcMain.handle()` and
 * `ipcRenderer.invoke()`. Channels are grouped by feature domain.
 */
export const IPC = {
  // AWS credential management
  AWS_LIST_PROFILES: 'aws:list-profiles',
  AWS_CONNECT_PROFILE: 'aws:connect-profile',
  AWS_CONNECTION_STATUS: 'aws:connection-status',
  AWS_LIST_MODELS: 'aws:list-models',
  AWS_SET_MODEL: 'aws:set-model',
  AWS_SSO_STATUS: 'aws:sso-status',
  AWS_SESSION_EXPIRED: 'aws:session-expired',

  // SSO configuration wizard
  SSO_LIST_CONFIGS: 'sso:list-configs',
  SSO_SAVE_CONFIG: 'sso:save-config',
  SSO_DELETE_CONFIG: 'sso:delete-config',
  SSO_START_DEVICE_AUTH: 'sso:start-device-auth',
  SSO_DISCOVER_ACCOUNTS: 'sso:discover-accounts',
  SSO_DISCOVER_ROLES: 'sso:discover-roles',
  SSO_CONNECT_WITH_CONFIG: 'sso:connect-with-config',

  // Chat / streaming
  CHAT_SEND_MESSAGE: 'chat:send-message',
  CHAT_STREAM_EVENT: 'chat:stream-event',
  CHAT_ABORT_STREAM: 'chat:abort-stream',

  // Tool execution
  TOOL_EXECUTE: 'tool:execute',

  // File operations
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_READ: 'file:read',
  FILE_EXPORT_CONVERSATION: 'file:export-conversation',

  // Conversation persistence
  STORE_LIST_CONVERSATIONS: 'store:list-conversations',
  STORE_GET_CONVERSATION: 'store:get-conversation',
  STORE_CREATE_CONVERSATION: 'store:create-conversation',
  STORE_DELETE_CONVERSATION: 'store:delete-conversation',
  STORE_SAVE_MESSAGE: 'store:save-message',
  STORE_GET_MESSAGES: 'store:get-messages',
  STORE_UPDATE_CONVERSATION_TITLE: 'store:update-conversation-title',
  STORE_SEARCH_CONVERSATIONS: 'store:search-conversations',

  // Admin config
  ADMIN_CONFIG_GET: 'admin:get-config',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_WIPE_DATA: 'settings:wipe-data',
} as const;

/** Union of all valid IPC channel name strings. */
export type IpcChannel = (typeof IPC)[keyof typeof IPC];
