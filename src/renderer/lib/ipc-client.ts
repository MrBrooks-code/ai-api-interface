// Typed wrapper around window.electronAPI for convenience
// Re-exports the API so components don't need to access window directly

function getAPI() {
  return window.electronAPI;
}

export const ipc = {
  // AWS
  listAwsProfiles: () => getAPI().listAwsProfiles(),
  connectWithProfile: (profile: string, region: string) =>
    getAPI().connectWithProfile(profile, region),
  getConnectionStatus: () => getAPI().getConnectionStatus(),
  listModels: () => getAPI().listModels(),
  setModel: (modelId: string) => getAPI().setModel(modelId),
  onSsoStatus: (callback: Parameters<typeof window.electronAPI.onSsoStatus>[0]) =>
    getAPI().onSsoStatus(callback),

  // SSO Wizard
  listSsoConfigs: () => getAPI().listSsoConfigs(),
  saveSsoConfig: (config: Parameters<typeof window.electronAPI.saveSsoConfig>[0]) =>
    getAPI().saveSsoConfig(config),
  deleteSsoConfig: (id: string) => getAPI().deleteSsoConfig(id),
  startSsoDeviceAuth: (startUrl: string, region: string) =>
    getAPI().startSsoDeviceAuth(startUrl, region),
  discoverSsoAccounts: () => getAPI().discoverSsoAccounts(),
  discoverSsoRoles: (accountId: string) => getAPI().discoverSsoRoles(accountId),
  connectWithSsoConfig: (configId: string) => getAPI().connectWithSsoConfig(configId),

  // Chat
  sendMessage: (params: Parameters<typeof window.electronAPI.sendMessage>[0]) =>
    getAPI().sendMessage(params),
  onStreamEvent: (callback: Parameters<typeof window.electronAPI.onStreamEvent>[0]) =>
    getAPI().onStreamEvent(callback),
  abortStream: (requestId: string) => getAPI().abortStream(requestId),

  // Tools
  executeTool: (name: string, input: Record<string, unknown>) =>
    getAPI().executeTool(name, input),

  // Files
  openFileDialog: () => getAPI().openFileDialog(),
  readFile: (filePath: string) => getAPI().readFile(filePath),

  // Store
  listConversations: () => getAPI().listConversations(),
  getConversation: (id: string) => getAPI().getConversation(id),
  createConversation: (id: string, title: string) => getAPI().createConversation(id, title),
  deleteConversation: (id: string) => getAPI().deleteConversation(id),
  updateConversationTitle: (id: string, title: string) => getAPI().updateConversationTitle(id, title),
  saveMessage: (message: Parameters<typeof window.electronAPI.saveMessage>[0]) =>
    getAPI().saveMessage(message),
  getMessages: (conversationId: string) => getAPI().getMessages(conversationId),

  // Admin Config
  getAdminConfig: () => getAPI().getAdminConfig(),

  // Settings
  getSetting: (key: string) => getAPI().getSetting(key),
  setSetting: (key: string, value: string) => getAPI().setSetting(key, value),
  wipeAllData: () => getAPI().wipeAllData(),
};
