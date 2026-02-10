// --- AWS / Connection ---

export interface AwsProfile {
  name: string;
  region?: string;
  isSso: boolean;
  ssoTokenValid?: boolean;
}

export interface SsoLoginStatus {
  stage: 'registering' | 'authorizing' | 'polling' | 'complete' | 'error';
  verificationUri?: string;
  userCode?: string;
  error?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  profile?: string;
  region?: string;
  modelId?: string;
  error?: string;
  ssoConfigId?: string;
  ssoConfigName?: string;
}

// --- SSO Configuration ---

export interface SsoConfiguration {
  id: string;
  name: string;
  ssoStartUrl: string;
  ssoRegion: string;
  accountId?: string;
  accountName?: string;
  roleName?: string;
  bedrockRegion: string;
  createdAt: number;
  updatedAt: number;
}

export interface SsoAccount {
  accountId: string;
  accountName: string;
  emailAddress?: string;
}

export interface SsoRole {
  roleName: string;
  accountId: string;
}

export interface BedrockModel {
  modelId: string;
  modelName: string;
  provider: string;
  /** 'inference-profile' for cross-region, 'foundation' for direct */
  source: 'inference-profile' | 'foundation';
}

// --- Chat Messages ---

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  format: 'png' | 'jpeg' | 'gif' | 'webp';
  name?: string;
  bytes: Uint8Array;
}

export interface DocumentBlock {
  type: 'document';
  format: 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md';
  name: string;
  bytes: Uint8Array;
}

export interface ToolUseBlock {
  type: 'toolUse';
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'toolResult';
  toolUseId: string;
  content: string;
  status: 'success' | 'error';
}

export type ContentBlock = TextBlock | ImageBlock | DocumentBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  timestamp: number;
  stopReason?: string;
}

// --- Conversations ---

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// --- Stream Events ---

export type StreamEventType =
  | 'messageStart'
  | 'contentBlockStart'
  | 'contentBlockDelta'
  | 'contentBlockStop'
  | 'messageStop'
  | 'metadata'
  | 'error';

export interface StreamEvent {
  requestId: string;
  type: StreamEventType;
  data: Record<string, unknown>;
}

// --- File Upload ---

export interface UploadedFile {
  path: string;
  name: string;
  type: 'image' | 'document';
  format: string;
  bytes: Uint8Array;
  size: number;
}

// --- Admin Config ---

export interface LoginBanner {
  title: string;
  message: string;
}

export interface AdminConfig {
  loginBanner: LoginBanner;
}

// --- App Settings ---

export type ThemeId =
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'nord'
  | 'tokyo-night'
  | 'rose-pine'
  | 'gruvbox-dark'
  | 'solarized-light';

export interface AppSettings {
  theme: ThemeId;
}

// --- Send Message Params ---

export interface SendMessageParams {
  conversationId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: ContentBlock[];
  }>;
  system?: string;
}

// --- Tool Definitions ---

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content: string;
}
