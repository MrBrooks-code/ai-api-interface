/**
 * @fileoverview Central Zustand store for application state. Holds connection
 * status, conversations, messages, streaming state, model selection, theme
 * preference, and UI flags. Streaming content is accumulated incrementally
 * as delta events arrive from the main process.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ContentBlock, ContentBlockStartData, ContentBlockDeltaData, Conversation, ConnectionStatus, BedrockModel, Folder, ThemeId, SsoLoginStatus } from '../../shared/types';

/** Default system prompt used when the user hasn't customized one yet. */
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful, accurate, and concise AI assistant. ' +
  'Provide clear and well-structured responses. ' +
  'If you are unsure about something, say so rather than guessing.';

/** Shape of the global application store. */
interface ChatState {
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  setConversations: (convos: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addConversation: (convo: Conversation) => void;
  removeConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;

  // Archive
  archivedConversations: Conversation[];
  archiveSectionExpanded: boolean;
  setArchivedConversations: (convos: Conversation[]) => void;
  toggleArchiveSection: () => void;
  archiveConversation: (id: string) => void;
  unarchiveConversation: (id: string) => void;

  // Folders
  folders: Folder[];
  collapsedFolderIds: Set<string>;
  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  removeFolder: (id: string) => void;
  updateFolderName: (id: string, name: string) => void;
  toggleFolderCollapsed: (id: string) => void;
  moveConversationToFolder: (conversationId: string, folderId: string | null) => void;
  reorderConversations: (orderedIds: string[]) => void;

  // Messages
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;

  // Streaming
  isStreaming: boolean;
  activeRequestId: string | null;
  streamingMessageId: string | null;
  setStreaming: (streaming: boolean, requestId?: string | null, messageId?: string | null) => void;

  // Streaming content accumulation
  appendToStreamingMessage: (contentBlockIndex: number, delta: ContentBlockDeltaData) => void;
  startContentBlock: (contentBlockIndex: number, start: ContentBlockStartData) => void;
  finalizeStreamingMessage: (stopReason: string) => void;

  // Models
  availableModels: BedrockModel[];
  selectedModelId: string | null;
  setAvailableModels: (models: BedrockModel[]) => void;
  setSelectedModelId: (modelId: string | null) => void;

  // Theme
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;

  // System prompt
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;

  // Messages loading
  messagesLoading: boolean;
  setMessagesLoading: (loading: boolean) => void;

  // Auto-connect
  autoConnecting: boolean;
  autoConnectSsoStatus: SsoLoginStatus | null;
  setAutoConnecting: (connecting: boolean) => void;
  setAutoConnectSsoStatus: (status: SsoLoginStatus | null) => void;

  // Sidebar visibility
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Preview panel
  previewPanel: {
    visible: boolean;
    content: string;
    language: 'html' | 'svg' | 'mermaid' | 'markdown' | 'csv' | 'latex';
    title: string;
  } | null;
  /** Incremented to signal ArtifactPanel should run its animated close. */
  previewCloseRequest: number;
  setPreviewPanel: (panel: ChatState['previewPanel']) => void;
  closePreviewPanel: () => void;
  /** Triggers the animated close sequence in ArtifactPanel. */
  requestClosePreview: () => void;

  // Settings panel
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Draft title preview for the sidebar when composing a new chat
  draftTitle: string;
  setDraftTitle: (title: string) => void;

  // Create a new message helper
  createMessage: (
    conversationId: string,
    role: 'user' | 'assistant',
    content: ContentBlock[]
  ) => ChatMessage;
}

/** Global Zustand store consumed by all React components and hooks. */
export const useChatStore = create<ChatState>((set, get) => ({
  // Connection
  connectionStatus: { connected: false },
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id, previewPanel: null }),
  addConversation: (convo) =>
    set((state) => ({ conversations: [convo, ...state.conversations] })),
  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      archivedConversations: state.archivedConversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
      previewPanel: state.activeConversationId === id ? null : state.previewPanel,
    })),
  updateConversationTitle: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
      archivedConversations: state.archivedConversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    })),

  // Archive
  archivedConversations: [],
  archiveSectionExpanded: false,
  setArchivedConversations: (convos) => set({ archivedConversations: convos }),
  toggleArchiveSection: () =>
    set((state) => ({ archiveSectionExpanded: !state.archiveSectionExpanded })),
  archiveConversation: (id) =>
    set((state) => {
      const convo = state.conversations.find((c) => c.id === id);
      if (!convo) return state;
      const archived = { ...convo, archivedAt: Date.now(), folderId: undefined };
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        archivedConversations: [archived, ...state.archivedConversations],
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        messages: state.activeConversationId === id ? [] : state.messages,
        previewPanel: state.activeConversationId === id ? null : state.previewPanel,
      };
    }),
  unarchiveConversation: (id) =>
    set((state) => {
      const convo = state.archivedConversations.find((c) => c.id === id);
      if (!convo) return state;
      const restored = { ...convo, archivedAt: undefined, updatedAt: Date.now() };
      return {
        archivedConversations: state.archivedConversations.filter((c) => c.id !== id),
        conversations: [restored, ...state.conversations],
      };
    }),

  // Folders
  folders: [],
  collapsedFolderIds: new Set<string>(),
  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      conversations: state.conversations.map((c) =>
        c.folderId === id ? { ...c, folderId: undefined } : c
      ),
    })),
  updateFolderName: (id, name) =>
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === id ? { ...f, name, updatedAt: Date.now() } : f
      ),
    })),
  toggleFolderCollapsed: (id) =>
    set((state) => {
      const next = new Set(state.collapsedFolderIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { collapsedFolderIds: next };
    }),
  moveConversationToFolder: (conversationId, folderId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, folderId: folderId ?? undefined, sortOrder: undefined } : c
      ),
    })),
  reorderConversations: (orderedIds) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, sortOrder: idx } : c;
      }),
      archivedConversations: state.archivedConversations.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, sortOrder: idx } : c;
      }),
    })),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, update) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
    })),

  // Streaming
  isStreaming: false,
  activeRequestId: null,
  streamingMessageId: null,
  setStreaming: (streaming, requestId = null, messageId = null) =>
    set({
      isStreaming: streaming,
      activeRequestId: requestId,
      streamingMessageId: messageId,
    }),

  startContentBlock: (contentBlockIndex, start) =>
    set((state) => {
      const msgId = state.streamingMessageId;
      if (!msgId) return state;

      return {
        messages: state.messages.map((m) => {
          if (m.id !== msgId) return m;

          const content = [...m.content];
          // Ensure array is big enough
          while (content.length <= contentBlockIndex) {
            content.push({ type: 'text', text: '' });
          }

          if (start.toolUse) {
            content[contentBlockIndex] = {
              type: 'toolUse',
              toolUseId: start.toolUse.toolUseId,
              name: start.toolUse.name,
              input: {},
            };
          }

          return { ...m, content };
        }),
      };
    }),

  appendToStreamingMessage: (contentBlockIndex, delta) =>
    set((state) => {
      const msgId = state.streamingMessageId;
      if (!msgId) return state;

      return {
        messages: state.messages.map((m) => {
          if (m.id !== msgId) return m;

          const content = [...m.content];
          // Ensure array is big enough
          while (content.length <= contentBlockIndex) {
            content.push({ type: 'text', text: '' });
          }

          const block = content[contentBlockIndex];
          if (delta.text && block.type === 'text') {
            content[contentBlockIndex] = {
              ...block,
              text: block.text + delta.text,
            };
          } else if (delta.toolUse && block.type === 'toolUse') {
            // Accumulate tool input JSON string
            const inputChunk = delta.toolUse.input ?? '';
            const currentInput = (block as { _rawInput?: string })._rawInput ?? '';
            content[contentBlockIndex] = {
              ...block,
              _rawInput: currentInput + inputChunk,
            } as ContentBlock & { _rawInput: string };
          }

          return { ...m, content };
        }),
      };
    }),

  finalizeStreamingMessage: (stopReason) =>
    set((state) => {
      const msgId = state.streamingMessageId;
      if (!msgId) return state;

      return {
        isStreaming: false,
        activeRequestId: null,
        streamingMessageId: null,
        messages: state.messages.map((m) => {
          if (m.id !== msgId) return m;

          // Parse accumulated tool input JSON
          const content = m.content.map((block) => {
            if (block.type === 'toolUse' && '_rawInput' in block) {
              const raw = (block as ContentBlock & { _rawInput: string })._rawInput;
              let parsed: Record<string, unknown> = {};
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = { raw };
              }
              const { _rawInput: _, ...rest } = block as ContentBlock & { _rawInput: string };
              void _;
              return { ...rest, input: parsed } as ContentBlock;
            }
            return block;
          });

          return { ...m, content, stopReason };
        }),
      };
    }),

  // Models
  availableModels: [],
  selectedModelId: null,
  setAvailableModels: (models) => set({ availableModels: models }),
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),

  // Theme
  theme: 'catppuccin-mocha' as ThemeId,
  setTheme: (theme) => set({ theme }),

  // System prompt
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

  // Messages loading
  messagesLoading: false,
  setMessagesLoading: (loading) => set({ messagesLoading: loading }),

  // Auto-connect
  autoConnecting: false,
  autoConnectSsoStatus: null,
  setAutoConnecting: (connecting) => set({ autoConnecting: connecting }),
  setAutoConnectSsoStatus: (status) => set({ autoConnectSsoStatus: status }),

  // Sidebar visibility
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Preview panel
  previewPanel: null,
  previewCloseRequest: 0,
  setPreviewPanel: (panel) => set({ previewPanel: panel }),
  closePreviewPanel: () => set({ previewPanel: null }),
  requestClosePreview: () => set((state) => ({ previewCloseRequest: state.previewCloseRequest + 1 })),

  // Settings panel
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  // Draft title
  draftTitle: '',
  setDraftTitle: (title) => set({ draftTitle: title }),

  // Helper
  createMessage: (conversationId, role, content) => ({
    id: uuidv4(),
    conversationId,
    role,
    content,
    timestamp: Date.now(),
  }),
}));
