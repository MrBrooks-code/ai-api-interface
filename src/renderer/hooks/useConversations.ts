import { useCallback, useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

export function useConversations() {
  const store = useChatStore();

  const loadConversations = useCallback(async () => {
    const convos = await ipc.listConversations();
    store.setConversations(convos);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const messages = await ipc.getMessages(conversationId);
    store.setMessages(messages);
    store.setActiveConversation(conversationId);
  }, []);

  const createConversation = useCallback(async () => {
    store.setActiveConversation(null);
    store.setMessages([]);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await ipc.deleteConversation(id);
    store.removeConversation(id);
  }, []);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
    conversations: store.conversations,
    activeConversationId: store.activeConversationId,
    loadConversations,
    loadMessages,
    createConversation,
    deleteConversation,
  };
}
