/**
 * @fileoverview Folder management hook. Provides CRUD operations for
 * conversation folders and handles moving conversations between them.
 */

import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

/**
 * Manages folders: create, rename, delete, move conversations, and toggle
 * collapse state. Loads the folder list from the database on mount.
 */
export function useFolders() {
  const store = useChatStore();

  const loadFolders = useCallback(async () => {
    const folders = await ipc.listFolders();
    store.setFolders(folders);
  }, []);

  /** Creates a new folder and returns its ID so the caller can enter rename mode. */
  const createFolder = useCallback(async (name = 'New Folder'): Promise<string> => {
    const id = uuidv4();
    const folder = await ipc.createFolder(id, name);
    store.addFolder(folder);
    return id;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    await ipc.renameFolder(id, name);
    store.updateFolderName(id, name);
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await ipc.deleteFolder(id);
    store.removeFolder(id);
  }, []);

  const moveConversationToFolder = useCallback(async (conversationId: string, folderId: string | null) => {
    try {
      const result = await ipc.moveConversationToFolder(conversationId, folderId);
      if (result && typeof result === 'object' && 'error' in result) return;
      store.moveConversationToFolder(conversationId, folderId);
    } catch {
      // IPC failure — store was not updated, state remains consistent
    }
  }, []);

  const toggleFolderCollapsed = useCallback((id: string) => {
    store.toggleFolderCollapsed(id);
  }, []);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  return {
    folders: store.folders,
    collapsedFolderIds: store.collapsedFolderIds,
    createFolder,
    renameFolder,
    deleteFolder,
    moveConversationToFolder,
    toggleFolderCollapsed,
  };
}
