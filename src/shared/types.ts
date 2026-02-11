/**
 * @fileoverview Shared type definitions used across main, preload, and renderer
 * processes. All inter-process data shapes are defined here to ensure type
 * safety across the Electron IPC boundary.
 */

// --- AWS / Connection ---

/** An AWS CLI profile discovered from `~/.aws/config` or `~/.aws/credentials`. */
export interface AwsProfile {
  name: string;
  region?: string;
  isSso: boolean;
  /** Whether a cached SSO token exists and is not expired. Only set for SSO profiles. */
  ssoTokenValid?: boolean;
}

/** Progress updates emitted during the SSO device authorization flow. */
export interface SsoLoginStatus {
  stage: 'registering' | 'authorizing' | 'polling' | 'complete' | 'error';
  /** The URL the user must visit to complete device authorization. */
  verificationUri?: string;
  /** The one-time code the user enters at the verification URI. */
  userCode?: string;
  error?: string;
}

/** Current state of the AWS connection, served to the renderer on request. */
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

/** A saved IAM Identity Center configuration created via the SSO wizard. */
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

/** An AWS account accessible via SSO, returned during account discovery. */
export interface SsoAccount {
  accountId: string;
  accountName: string;
  emailAddress?: string;
}

/** An IAM role within an AWS account, returned during role discovery. */
export interface SsoRole {
  roleName: string;
  accountId: string;
}

/** A Bedrock model available for use, from inference profiles or foundation models. */
export interface BedrockModel {
  modelId: string;
  modelName: string;
  provider: string;
  /** `'inference-profile'` for cross-region, `'foundation'` for direct invocation. */
  source: 'inference-profile' | 'foundation';
}

// --- Chat Messages ---

/** A plain text content block within a chat message. */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** An image content block with raw bytes, sent inline to the Bedrock Converse API. */
export interface ImageBlock {
  type: 'image';
  format: 'png' | 'jpeg' | 'gif' | 'webp';
  name?: string;
  bytes: Uint8Array;
}

/** A document content block with raw bytes, sent inline to the Bedrock Converse API. */
export interface DocumentBlock {
  type: 'document';
  format: 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md';
  name: string;
  bytes: Uint8Array;
}

/** A tool invocation requested by the assistant. */
export interface ToolUseBlock {
  type: 'toolUse';
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

/** The result of a tool execution, sent back to the model in the next turn. */
export interface ToolResultBlock {
  type: 'toolResult';
  toolUseId: string;
  content: string;
  status: 'success' | 'error';
}

/** Union of all content block types that can appear in a {@link ChatMessage}. */
export type ContentBlock = TextBlock | ImageBlock | DocumentBlock | ToolUseBlock | ToolResultBlock;

/** A single message in a conversation, persisted to the local SQLite database. */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Bedrock stop reason (e.g. `'end_turn'`, `'tool_use'`, `'max_tokens'`). */
  stopReason?: string;
}

// --- Conversations ---

/** A conversation record persisted to the local SQLite database. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// --- Stream Events ---

/** Data carried by a `contentBlockStart` event. */
export interface ContentBlockStartData {
  toolUse?: { toolUseId: string; name: string };
}

/** Data carried by a `contentBlockDelta` event. */
export interface ContentBlockDeltaData {
  text?: string;
  toolUse?: { input?: string };
}

/** Discriminated union of all streaming events pushed from main to renderer. */
export type StreamEvent =
  | { requestId: string; type: 'messageStart'; data: { role: string } }
  | { requestId: string; type: 'contentBlockStart'; data: { contentBlockIndex: number; start: ContentBlockStartData } }
  | { requestId: string; type: 'contentBlockDelta'; data: { contentBlockIndex: number; delta: ContentBlockDeltaData } }
  | { requestId: string; type: 'contentBlockStop'; data: { contentBlockIndex: number } }
  | { requestId: string; type: 'messageStop'; data: { stopReason: string } }
  | { requestId: string; type: 'metadata'; data: { usage?: Record<string, unknown> } }
  | { requestId: string; type: 'error'; data: { message: string } };

// --- File Upload ---

/** A file read from disk via the file dialog, ready to be attached to a message. */
export interface UploadedFile {
  path: string;
  name: string;
  type: 'image' | 'document';
  format: string;
  bytes: Uint8Array;
  /** File size in bytes. */
  size: number;
}

// --- Admin Config ---

/** The logon banner text displayed on the empty-chat screen (CMMC AC.L2-3.1.9). */
export interface LoginBanner {
  title: string;
  message: string;
  /** Text shown in the draggable title bar at the top of the window. */
  titlebar: string;
}

/** IT-managed application configuration loaded from `resources/admin-config.json`. */
export interface AdminConfig {
  loginBanner: LoginBanner;
  /** Maximum session duration in minutes before auto-disconnect. Default: 60. */
  sessionDurationMinutes: number;
}

// --- App Settings ---

/** Identifier for the active color theme. Each maps to a CSS class in `styles.css`. */
export type ThemeId =
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'nord'
  | 'tokyo-night'
  | 'rose-pine'
  | 'gruvbox-dark'
  | 'solarized-light';

/** User-facing application settings persisted to the local database. */
export interface AppSettings {
  theme: ThemeId;
}

// --- Send Message Params ---

/** Parameters for the `CHAT_SEND_MESSAGE` IPC call. */
export interface SendMessageParams {
  conversationId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: ContentBlock[];
  }>;
  /** Optional system prompt prepended to the conversation. */
  system?: string;
}

// --- Tool Definitions ---

/** Schema definition for a tool that the Bedrock model can invoke. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's expected input. */
  inputSchema: Record<string, unknown>;
}

/** The outcome of executing a tool in the main process. */
export interface ToolResult {
  success: boolean;
  content: string;
}
