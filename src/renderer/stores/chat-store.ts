import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ContentBlock, Conversation, ConnectionStatus, BedrockModel, ThemeId } from '../../shared/types';

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
  appendToStreamingMessage: (contentBlockIndex: number, delta: Record<string, unknown>) => void;
  startContentBlock: (contentBlockIndex: number, start: Record<string, unknown>) => void;
  finalizeStreamingMessage: (stopReason: string) => void;

  // Models
  availableModels: BedrockModel[];
  selectedModelId: string | null;
  setAvailableModels: (models: BedrockModel[]) => void;
  setSelectedModelId: (modelId: string | null) => void;

  // Theme
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;

  // Settings panel
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Create a new message helper
  createMessage: (
    conversationId: string,
    role: 'user' | 'assistant',
    content: ContentBlock[]
  ) => ChatMessage;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Connection
  connectionStatus: { connected: false },
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  addConversation: (convo) =>
    set((state) => ({ conversations: [convo, ...state.conversations] })),
  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
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
            const tu = start.toolUse as { toolUseId: string; name: string };
            content[contentBlockIndex] = {
              type: 'toolUse',
              toolUseId: tu.toolUseId,
              name: tu.name,
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
              text: block.text + (delta.text as string),
            };
          } else if (delta.toolUse && block.type === 'toolUse') {
            // Accumulate tool input JSON string
            const inputChunk = (delta.toolUse as { input?: string }).input ?? '';
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

  // Settings panel
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  // Helper
  createMessage: (conversationId, role, content) => ({
    id: uuidv4(),
    conversationId,
    role,
    content,
    timestamp: Date.now(),
  }),
}));
