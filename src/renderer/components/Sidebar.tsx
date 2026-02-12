/**
 * @fileoverview Left sidebar listing saved conversations grouped by folder,
 * a "New Chat" button, folder management, and the current AWS connection
 * status indicator at the bottom. Supports HTML5 drag-and-drop for moving
 * conversations between folders, reordering within a group, and archiving
 * by dropping onto the archive section header.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConversations } from '../hooks/useConversations';
import { useFolders } from '../hooks/useFolders';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import type { Conversation, Folder } from '../../shared/types';

/** Minimum and maximum sidebar widths in pixels. */
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

/** MIME type used for conversation drag-and-drop data transfer. */
const DND_MIME = 'application/x-conversation-id';

/** Sentinel folderId used for the archive group to distinguish it from uncategorized (also null). */
const ARCHIVE_GROUP_ID = '__archive__';

/** Props for an individual conversation row in the sidebar. */
interface ConversationRowProps {
  convo: Conversation;
  isArchived: boolean;
  isActive: boolean;
  editingId: string | null;
  editingTitle: string;
  editInputRef: React.Ref<HTMLInputElement>;
  menuOpenId: string | null;
  menuRef: React.Ref<HTMLSpanElement>;
  isDraggable: boolean;
  dropIndicator: 'above' | 'below' | null;
  onSelect: () => void;
  onDoubleClick: () => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onMenuToggle: () => void;
  onExport: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onRowDragOver: (e: React.DragEvent) => void;
  onRowDrop: (e: React.DragEvent) => void;
  onRowDragLeave: () => void;
  onDragStartNotify: (id: string) => void;
}

/** A single conversation row with inline rename, context menu, drag support, and archive support. */
function ConversationRow({
  convo, isArchived, isActive, editingId, editingTitle, editInputRef,
  menuOpenId, menuRef, isDraggable, dropIndicator, onSelect, onDoubleClick, onEditChange, onEditCommit,
  onEditCancel, onMenuToggle, onExport, onArchiveToggle, onDelete,
  onRowDragOver, onRowDrop, onRowDragLeave, onDragStartNotify,
}: ConversationRowProps) {
  const isEditing = editingId === convo.id;
  const isMenuOpen = menuOpenId === convo.id;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DND_MIME, convo.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStartNotify(convo.id);
  };

  return (
    <div
      className="relative"
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      onDragLeave={onRowDragLeave}
    >
      {dropIndicator === 'above' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-primary rounded-full z-10" />
      )}
      <button
        type="button"
        draggable={isDraggable && !isEditing}
        onDragStart={handleDragStart}
        className={`group flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors w-full text-left ${
          isActive
            ? 'bg-surface-lighter text-text'
            : 'text-text-muted hover:bg-primary/10 hover:text-text'
        }`}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onDoubleClick={onDoubleClick}
      >
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingTitle}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onEditCommit(); }
              else if (e.key === 'Escape') { e.preventDefault(); onEditCancel(); }
            }}
            onClick={(e) => e.stopPropagation()}
            className={`flex-1 min-w-0 text-sm bg-transparent border-b border-primary outline-none text-text ${isArchived ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className={`flex-1 truncate text-sm ${isArchived ? 'opacity-60' : ''}`}>{convo.title}</span>
        )}
        {/* Context menu trigger */}
        <span className="relative" ref={isMenuOpen ? menuRef : undefined}>
          <span
            role="button"
            tabIndex={0}
            title="Conversation options"
            onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onMenuToggle(); }
            }}
            className={`${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'} text-text-dim hover:text-text transition-opacity text-xs px-1`}
          >
            ⋯
          </span>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-surface-lighter bg-surface shadow-lg py-1">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-primary/10 hover:text-text transition-colors"
                onClick={(e) => { e.stopPropagation(); onExport(); }}
              >
                Export Chat
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-primary/10 hover:text-text transition-colors"
                onClick={(e) => { e.stopPropagation(); onArchiveToggle(); }}
              >
                {isArchived ? 'Unarchive Chat' : 'Archive Chat'}
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-accent-red/10 hover:text-accent-red transition-colors"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                Delete Chat
              </button>
            </div>
          )}
        </span>
      </button>
      {dropIndicator === 'below' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full z-10" />
      )}
    </div>
  );
}

/** Props for a folder row in the sidebar. */
interface FolderRowProps {
  folder: Folder;
  isCollapsed: boolean;
  conversationCount: number;
  editingFolderId: string | null;
  editingFolderName: string;
  folderMenuOpenId: string | null;
  folderMenuRef: React.Ref<HTMLSpanElement>;
  editFolderInputRef: React.Ref<HTMLInputElement>;
  onToggleCollapse: () => void;
  onDoubleClick: () => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onMenuToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** A collapsible folder row with inline rename and context menu. */
function FolderRow({
  folder, isCollapsed, conversationCount,
  editingFolderId, editingFolderName, folderMenuOpenId, folderMenuRef, editFolderInputRef,
  onToggleCollapse, onDoubleClick, onEditChange, onEditCommit, onEditCancel,
  onMenuToggle, onRename, onDelete,
}: FolderRowProps) {
  const isEditing = editingFolderId === folder.id;
  const isMenuOpen = folderMenuOpenId === folder.id;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
        className="group w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-dim hover:text-text-muted transition-colors"
      >
        <span className="text-[10px]">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
        {isEditing ? (
          <input
            ref={editFolderInputRef}
            type="text"
            value={editingFolderName}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onEditCommit(); }
              else if (e.key === 'Escape') { e.preventDefault(); onEditCancel(); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-xs bg-transparent border-b border-primary outline-none text-text"
          />
        ) : (
          <span className="flex-1 truncate text-left font-medium">
            {folder.name}
            {isCollapsed && <span className="text-text-dim font-normal ml-1">({conversationCount})</span>}
          </span>
        )}
        {/* Folder context menu trigger */}
        <span className="relative" ref={isMenuOpen ? folderMenuRef : undefined}>
          <span
            role="button"
            tabIndex={0}
            title="Folder options"
            onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onMenuToggle(); }
            }}
            className={`${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'} text-text-dim hover:text-text transition-opacity px-1`}
          >
            ⋯
          </span>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-surface-lighter bg-surface shadow-lg py-1">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-primary/10 hover:text-text transition-colors"
                onClick={(e) => { e.stopPropagation(); onRename(); }}
              >
                Rename Folder
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-accent-red/10 hover:text-accent-red transition-colors"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                Delete Folder
              </button>
            </div>
          )}
        </span>
      </button>
    </div>
  );
}

/** Navigation sidebar with conversation history, folders, and connection status. */
export default function Sidebar() {
  const {
    conversations, activeConversationId, loadMessages, createConversation,
    deleteConversation, renameConversation, archiveConversation, unarchiveConversation,
    archivedConversations, archiveSectionExpanded, toggleArchiveSection,
    reorderConversations,
  } = useConversations();
  const {
    folders, collapsedFolderIds,
    createFolder, renameFolder, deleteFolder,
    moveConversationToFolder, toggleFolderCollapsed,
  } = useFolders();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const draftTitle = useChatStore((s) => s.draftTitle);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state (conversations)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state (folders)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const editFolderInputRef = useRef<HTMLInputElement>(null);

  // Inline delete-confirmation state
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingDeleteFolderId, setConfirmingDeleteFolderId] = useState<string | null>(null);

  // Context menu state — tracks which item's "⋯" menu is open
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [folderMenuOpenId, setFolderMenuOpenId] = useState<string | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isDraggingConversation, setIsDraggingConversation] = useState(false);
  const [reorderTarget, setReorderTarget] = useState<{ conversationId: string; position: 'above' | 'below' } | null>(null);
  const [dragOverArchive, setDragOverArchive] = useState(false);
  const draggingConversationIdRef = useRef<string | null>(null);

  const isSearching = searchResults !== null;

  /** Commits the conversation rename if changed, then exits edit mode. */
  const commitRename = useCallback(() => {
    if (editingId) {
      const trimmed = editingTitle.trim();
      const existing = conversations.find((c) => c.id === editingId) ?? archivedConversations.find((c) => c.id === editingId);
      if (trimmed && trimmed !== existing?.title) {
        renameConversation(editingId, trimmed);
      }
    }
    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, conversations, archivedConversations, renameConversation]);

  /** Cancels the inline conversation rename without saving. */
  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  /** Commits the folder rename if changed, then exits edit mode. */
  const commitFolderRename = useCallback(() => {
    if (editingFolderId) {
      const trimmed = editingFolderName.trim();
      const existing = folders.find((f) => f.id === editingFolderId);
      if (trimmed && trimmed !== existing?.name) {
        renameFolder(editingFolderId, trimmed);
      }
    }
    setEditingFolderId(null);
    setEditingFolderName('');
  }, [editingFolderId, editingFolderName, folders, renameFolder]);

  /** Cancels the inline folder rename without saving. */
  const cancelFolderRename = useCallback(() => {
    setEditingFolderId(null);
    setEditingFolderName('');
  }, []);

  // Auto-focus and select the inline rename input when it appears
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Auto-focus and select the folder rename input when it appears
  useEffect(() => {
    if (editingFolderId && editFolderInputRef.current) {
      editFolderInputRef.current.focus();
      editFolderInputRef.current.select();
    }
  }, [editingFolderId]);

  // --- Resizable sidebar ---
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
    setWidth(clamped);
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startResize = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Global drag tracking to show drop zones
  useEffect(() => {
    const handleDragStart = () => setIsDraggingConversation(true);
    const handleDragEnd = () => {
      setIsDraggingConversation(false);
      setDragOverFolderId(null);
      setReorderTarget(null);
      setDragOverArchive(false);
      draggingConversationIdRef.current = null;
    };
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  // Debounced search via IPC
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const results = await ipc.searchConversations(searchQuery.trim(), archiveSectionExpanded);
      setSearchResults(results);
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, archiveSectionExpanded]);

  /** Show the delete confirmation dialog when the keyboard shortcut fires. */
  useEffect(() => {
    const handler = (e: Event) => {
      const conversationId = (e as CustomEvent<{ conversationId: string }>).detail.conversationId;
      setConfirmingDeleteId(conversationId);
    };
    window.addEventListener('request-delete-conversation', handler);
    return () => window.removeEventListener('request-delete-conversation', handler);
  }, []);

  /** Cancel delete confirmation on Escape. */
  useEffect(() => {
    if (!confirmingDeleteId && !confirmingDeleteFolderId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmingDeleteId(null);
        setConfirmingDeleteFolderId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmingDeleteId, confirmingDeleteFolderId]);

  // Close the context menus on outside click or Escape
  useEffect(() => {
    if (!menuOpenId && !folderMenuOpenId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuOpenId && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
      if (folderMenuOpenId && folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenuOpenId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenId(null);
        setFolderMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpenId, folderMenuOpenId]);

  const confirmingConversation = confirmingDeleteId
    ? conversations.find((c) => c.id === confirmingDeleteId)
      ?? archivedConversations.find((c) => c.id === confirmingDeleteId)
      ?? null
    : null;

  const confirmingFolder = confirmingDeleteFolderId
    ? folders.find((f) => f.id === confirmingDeleteFolderId) ?? null
    : null;

  /** Focus the search input when the global Cmd/Ctrl+K shortcut fires. */
  useEffect(() => {
    const handler = () => {
      const { sidebarCollapsed, setSidebarCollapsed } = useChatStore.getState();
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('focus-search-input', handler);
    return () => window.removeEventListener('focus-search-input', handler);
  }, []);

  // When searching, split results by archive status for display in the two sections
  const displayedConversations = searchResults
    ? searchResults.filter((c) => !c.archivedAt)
    : conversations;
  const displayedArchived = searchResults
    ? searchResults.filter((c) => !!c.archivedAt)
    : archivedConversations;

  // Group conversations by folder for non-search display, respecting manual sort order.
  const { uncategorized, byFolder } = useMemo(() => {
    if (isSearching) return { uncategorized: displayedConversations, byFolder: new Map<string, Conversation[]>() };
    const uncategorized: Conversation[] = [];
    const byFolder = new Map<string, Conversation[]>();
    for (const convo of displayedConversations) {
      if (convo.folderId) {
        const list = byFolder.get(convo.folderId);
        if (list) list.push(convo);
        else byFolder.set(convo.folderId, [convo]);
      } else {
        uncategorized.push(convo);
      }
    }
    // Sort groups that have any manually-ordered conversation by sortOrder
    const sortGroup = (arr: Conversation[]) => {
      if (arr.some((c) => c.sortOrder != null)) {
        arr.sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
      }
    };
    sortGroup(uncategorized);
    byFolder.forEach((list) => sortGroup(list));
    return { uncategorized, byFolder };
  }, [displayedConversations, isSearching]);

  /** Handles dropping a conversation on a folder or the uncategorized zone. Unarchives first if needed. */
  const handleDrop = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const conversationId = e.dataTransfer.getData(DND_MIME);
    if (conversationId) {
      const isFromArchive = useChatStore.getState().archivedConversations.some((c) => c.id === conversationId);
      if (isFromArchive) unarchiveConversation(conversationId);
      moveConversationToFolder(conversationId, folderId);
    }
  }, [moveConversationToFolder, unarchiveConversation]);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverFolderId(null);
  }, []);

  /** Creates a new folder and auto-enters rename mode. */
  const handleCreateFolder = useCallback(async () => {
    const id = await createFolder();
    setEditingFolderId(id);
    setEditingFolderName('New Folder');
  }, [createFolder]);

  /** Handles per-row dragOver — determines above/below indicator for same-group, or shows folder highlight for cross-group. */
  const handleRowDragOver = useCallback((e: React.DragEvent, conversationId: string, groupConvos: Conversation[], folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draggedId = draggingConversationIdRef.current;
    const sameGroup = draggedId != null && groupConvos.some((c) => c.id === draggedId);

    if (sameGroup) {
      // Same group — show reorder indicator, block parent folder zone
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const position = e.clientY < midpoint ? 'above' : 'below';
      setReorderTarget((prev) =>
        prev?.conversationId === conversationId && prev.position === position ? prev : { conversationId, position }
      );
      setDragOverFolderId(null);
    } else {
      // Cross-group — show appropriate zone highlight, no reorder indicator
      e.stopPropagation();
      setReorderTarget(null);
      if (folderId === ARCHIVE_GROUP_ID) {
        setDragOverArchive(true);
        setDragOverFolderId(null);
      } else {
        setDragOverArchive(false);
        setDragOverFolderId(folderId ?? 'uncategorized');
      }
    }
  }, []);

  /** Handles drop on a conversation row — reorder within same group, or move folder for cross-group. */
  const handleRowDrop = useCallback((e: React.DragEvent, targetId: string, groupConvos: Conversation[], folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData(DND_MIME);
    setReorderTarget(null);
    setDragOverFolderId(null);
    setDragOverArchive(false);
    if (!draggedId || draggedId === targetId) return;

    // Cross-group: move to this group's folder, archive, or unarchive as needed
    if (!groupConvos.some((c) => c.id === draggedId)) {
      const isFromArchive = useChatStore.getState().archivedConversations.some((c) => c.id === draggedId);
      if (folderId === ARCHIVE_GROUP_ID) {
        if (!isFromArchive) archiveConversation(draggedId);
      } else {
        if (isFromArchive) unarchiveConversation(draggedId);
        moveConversationToFolder(draggedId, folderId);
      }
      return;
    }

    // Same group: reorder
    const orderedIds = groupConvos.map((c) => c.id).filter((id) => id !== draggedId);
    const targetIndex = orderedIds.indexOf(targetId);
    const position = reorderTarget?.conversationId === targetId ? reorderTarget.position : 'below';
    const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
    orderedIds.splice(insertIndex, 0, draggedId);
    reorderConversations(orderedIds);
  }, [reorderTarget, reorderConversations, moveConversationToFolder, unarchiveConversation, archiveConversation]);

  const handleRowDragLeave = useCallback(() => {
    setReorderTarget(null);
  }, []);

  /** Renders conversation rows for a given list, used by both uncategorized and folder sections. */
  const renderConversationRows = (convos: Conversation[], isArchived: boolean, folderId: string | null) =>
    convos.map((convo) => (
      <ConversationRow
        key={convo.id}
        convo={convo}
        isArchived={isArchived}
        isActive={convo.id === activeConversationId}
        editingId={editingId}
        editingTitle={editingTitle}
        editInputRef={editInputRef}
        menuOpenId={menuOpenId}
        menuRef={menuRef}
        isDraggable={!isSearching}
        dropIndicator={
          !isSearching && reorderTarget?.conversationId === convo.id
            ? reorderTarget.position
            : null
        }
        onSelect={() => { if (editingId !== convo.id) loadMessages(convo.id); }}
        onDoubleClick={() => { setConfirmingDeleteId(null); setEditingId(convo.id); setEditingTitle(convo.title); }}
        onEditChange={(v) => setEditingTitle(v)}
        onEditCommit={commitRename}
        onEditCancel={cancelRename}
        onMenuToggle={() => setMenuOpenId(menuOpenId === convo.id ? null : convo.id)}
        onExport={() => { setMenuOpenId(null); ipc.exportConversation(convo.id); }}
        onArchiveToggle={() => { setMenuOpenId(null); (isArchived ? unarchiveConversation : archiveConversation)(convo.id); }}
        onDelete={() => { setMenuOpenId(null); setConfirmingDeleteId(convo.id); }}
        onRowDragOver={(e) => !isSearching ? handleRowDragOver(e, convo.id, convos, folderId) : undefined}
        onRowDrop={(e) => !isSearching ? handleRowDrop(e, convo.id, convos, folderId) : undefined}
        onRowDragLeave={handleRowDragLeave}
        onDragStartNotify={(id) => { draggingConversationIdRef.current = id; }}
      />
    ));

  return (
    <aside
      className="relative bg-surface-light flex flex-col border-r border-surface-lighter flex-shrink-0"
      style={{ width }}
    >
      {/* Search filter */}
      {(conversations.length > 0 || archivedConversations.length > 0) && (
        <div className="px-3 pt-2 pb-1.5">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-text border border-surface-lighter focus:border-primary outline-none"
          />
        </div>
      )}

      <div className="px-3 pb-2 flex flex-col gap-1">
        <button
          onClick={createConversation}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/25 hover:text-text transition-colors text-sm font-medium text-left"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          New Chat
        </button>
        {!isSearching && (
          <button
            onClick={handleCreateFolder}
            title="New Folder"
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/25 hover:text-text transition-colors text-sm font-medium text-left"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            New Folder
          </button>
        )}
      </div>

      <div className="mx-3 border-t border-surface-lighter" />

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {/* Animated draft indicator shown while composing a new chat */}
        {activeConversationId === null && draftTitle && (
          <div className="flex items-center px-3 py-2 rounded-lg mb-0.5 bg-surface-lighter">
            <span className="flex gap-1 items-center py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim thinking-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim thinking-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim thinking-dot" />
            </span>
          </div>
        )}

        {isSearching ? (
          /* Flat search results — no folder grouping, no drag */
          <>
            {renderConversationRows(displayedConversations, false, null)}
          </>
        ) : (
          <>
            {/* Uncategorized conversations — drop target for removing from folders */}
            <div
              className={`rounded-lg transition-colors ${isDraggingConversation && dragOverFolderId === 'uncategorized' ? 'bg-primary/15' : ''}`}
              onDragOver={(e) => handleDragOver(e, 'uncategorized')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null)}
            >
              {uncategorized.length > 0 && renderConversationRows(uncategorized, false, null)}
              {/* Minimal drop zone when empty and dragging */}
              {isDraggingConversation && uncategorized.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-dim text-center rounded-lg border border-dashed border-primary/30">
                  Drop here to uncategorize
                </div>
              )}
            </div>

            {/* Folder sections */}
            {folders.map((folder) => {
              const folderConvos = byFolder.get(folder.id) ?? [];
              const isCollapsed = collapsedFolderIds.has(folder.id);
              const isFolderDragOver = isDraggingConversation && dragOverFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={`rounded-lg transition-colors ${isFolderDragOver ? 'bg-accent-peach/15 ring-1 ring-accent-peach/40' : ''}`}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder.id)}
                >
                  <FolderRow
                    folder={folder}
                    isCollapsed={isCollapsed}
                    conversationCount={folderConvos.length}
                    editingFolderId={editingFolderId}
                    editingFolderName={editingFolderName}
                    folderMenuOpenId={folderMenuOpenId}
                    folderMenuRef={folderMenuRef}
                    editFolderInputRef={editFolderInputRef}
                    onToggleCollapse={() => toggleFolderCollapsed(folder.id)}
                    onDoubleClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                    onEditChange={(v) => setEditingFolderName(v)}
                    onEditCommit={commitFolderRename}
                    onEditCancel={cancelFolderRename}
                    onMenuToggle={() => setFolderMenuOpenId(folderMenuOpenId === folder.id ? null : folder.id)}
                    onRename={() => { setFolderMenuOpenId(null); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                    onDelete={() => { setFolderMenuOpenId(null); setConfirmingDeleteFolderId(folder.id); }}
                  />
                  {!isCollapsed && renderConversationRows(folderConvos, false, folder.id)}
                </div>
              );
            })}
          </>
        )}

        {conversations.length === 0 && archivedConversations.length === 0 && folders.length === 0 && (
          <p className="text-text-dim text-xs text-center mt-8 px-4">
            No conversations yet. Start a new chat!
          </p>
        )}

        {(conversations.length > 0 || archivedConversations.length > 0) && displayedConversations.length === 0 && displayedArchived.length === 0 && (
          <p className="text-text-dim text-xs text-center mt-8 px-4">
            No matching conversations
          </p>
        )}

        {/* Collapsible archived section — also a drop target for archiving */}
        {(displayedArchived.length > 0 || isDraggingConversation) && (
          <div
            className={`rounded-lg mt-2 transition-colors ${dragOverArchive ? 'bg-accent-yellow/15 ring-1 ring-accent-yellow/40' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              setDragOverArchive(true);
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the wrapper itself, not when entering a child
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverArchive(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverArchive(false);
              const conversationId = e.dataTransfer.getData(DND_MIME);
              if (!conversationId) return;
              const alreadyArchived = useChatStore.getState().archivedConversations.some((c) => c.id === conversationId);
              if (!alreadyArchived) archiveConversation(conversationId);
            }}
          >
            <button
              type="button"
              onClick={toggleArchiveSection}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-text-dim hover:text-text-muted transition-colors"
            >
              <span className="text-[10px]">{archiveSectionExpanded ? '\u25BC' : '\u25B6'}</span>
              Archived ({displayedArchived.length})
            </button>
            {archiveSectionExpanded && renderConversationRows(displayedArchived, true, ARCHIVE_GROUP_ID)}
          </div>
        )}
      </div>

      {/* Bottom: Connection status + Settings */}
      <div className="p-3 border-t border-surface-lighter">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-lighter transition-colors text-sm"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus.connected ? 'bg-accent-green' : 'bg-accent-red'
            }`}
          />
          <span className="text-text-muted truncate">
            {connectionStatus.connected
              ? `${connectionStatus.ssoConfigName ?? connectionStatus.profile ?? 'Connected'} (${connectionStatus.region})`
              : 'Not Connected'}
          </span>
        </button>
      </div>
      {/* Drag handle for resizing */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
      />

      {/* Delete conversation confirmation modal */}
      {confirmingConversation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmingDeleteId(null)}
        >
          <div
            className="rounded-xl border border-accent-red/30 bg-surface shadow-lg px-6 py-5 space-y-4 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text">Delete Chat</h3>
            <p className="text-sm text-text-muted">
              Are you sure you want to delete &ldquo;{confirmingConversation.title}&rdquo;? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmingDeleteId(null)}
                className="px-4 py-2 rounded-lg bg-surface-lighter text-text text-sm font-medium hover:bg-surface-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = confirmingConversation.id;
                  setConfirmingDeleteId(null);
                  deleteConversation(id);
                }}
                className="px-4 py-2 rounded-lg bg-accent-red text-surface text-sm font-medium hover:bg-accent-red/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder confirmation modal */}
      {confirmingFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmingDeleteFolderId(null)}
        >
          <div
            className="rounded-xl border border-accent-red/30 bg-surface shadow-lg px-6 py-5 space-y-4 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text">Delete Folder</h3>
            <p className="text-sm text-text-muted">
              Are you sure you want to delete &ldquo;{confirmingFolder.name}&rdquo;? Conversations in this folder will be moved to Uncategorized.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmingDeleteFolderId(null)}
                className="px-4 py-2 rounded-lg bg-surface-lighter text-text text-sm font-medium hover:bg-surface-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = confirmingFolder.id;
                  setConfirmingDeleteFolderId(null);
                  deleteFolder(id);
                }}
                className="px-4 py-2 rounded-lg bg-accent-red text-surface text-sm font-medium hover:bg-accent-red/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
