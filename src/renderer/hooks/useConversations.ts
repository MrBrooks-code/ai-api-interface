/**
 * @fileoverview Conversation management hook. Provides CRUD operations for
 * conversations and handles loading messages when switching between them.
 */

import { useCallback, useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

/**
 * Manages conversations: create, delete, load messages, and switch active
 * conversation. Loads the conversation list from the database on mount.
 */
export function useConversations() {
  const store = useChatStore();

  const loadConversations = useCallback(async () => {
    const convos = await ipc.listConversations();
    store.setConversations(convos);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    store.setMessagesLoading(true);
    const messages = await ipc.getMessages(conversationId);
    store.setMessages(messages);
    store.setMessagesLoading(false);
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

  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    await ipc.updateConversationTitle(id, newTitle);
    store.updateConversationTitle(id, newTitle);
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
    renameConversation,
  };
}
