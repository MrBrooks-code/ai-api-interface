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

  const loadArchivedConversations = useCallback(async () => {
    const convos = await ipc.listArchivedConversations();
    store.setArchivedConversations(convos);
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

  const archiveConversation = useCallback(async (id: string) => {
    await ipc.archiveConversation(id);
    store.archiveConversation(id);
  }, []);

  const unarchiveConversation = useCallback(async (id: string) => {
    await ipc.unarchiveConversation(id);
    store.unarchiveConversation(id);
  }, []);

  const reorderConversations = useCallback(async (orderedIds: string[]) => {
    const items = orderedIds.map((id, i) => ({ id, sortOrder: i }));
    store.reorderConversations(orderedIds);
    try {
      const result = await ipc.reorderConversations(items);
      if (result && typeof result === 'object' && 'error' in result) {
        await loadConversations();
      }
    } catch {
      // IPC failed (rate limit, DB error) — reload from database to re-sync
      await loadConversations();
    }
  }, [loadConversations]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadArchivedConversations();
  }, [loadConversations, loadArchivedConversations]);

  return {
    conversations: store.conversations,
    activeConversationId: store.activeConversationId,
    archivedConversations: store.archivedConversations,
    archiveSectionExpanded: store.archiveSectionExpanded,
    toggleArchiveSection: store.toggleArchiveSection,
    loadConversations,
    loadMessages,
    createConversation,
    deleteConversation,
    renameConversation,
    archiveConversation,
    unarchiveConversation,
    reorderConversations,
  };
}
