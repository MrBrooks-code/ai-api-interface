/**
 * @fileoverview Left sidebar listing saved conversations, a "New Chat" button,
 * and the current AWS connection status indicator at the bottom.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConversations } from '../hooks/useConversations';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import type { Conversation } from '../../shared/types';

/** Minimum and maximum sidebar widths in pixels. */
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

/** Navigation sidebar with conversation history and connection status. */
export default function Sidebar() {
  const { conversations, activeConversationId, loadMessages, createConversation, deleteConversation, renameConversation } =
    useConversations();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const draftTitle = useChatStore((s) => s.draftTitle);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline delete-confirmation state
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Context menu state — tracks which conversation's "⋯" menu is open
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Commits the rename if the title changed and is non-empty, then exits edit mode. */
  const commitRename = useCallback(() => {
    if (editingId) {
      const trimmed = editingTitle.trim();
      if (trimmed && trimmed !== conversations.find((c) => c.id === editingId)?.title) {
        renameConversation(editingId, trimmed);
      }
    }
    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, conversations, renameConversation]);

  /** Cancels the inline rename without saving. */
  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  // Auto-focus and select the inline rename input when it appears
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // --- Resizable sidebar ---
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
    setWidth(clamped);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
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
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Debounced search via IPC — searches titles and message content in SQLite
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const results = await ipc.searchConversations(searchQuery.trim());
      setSearchResults(results);
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

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
    if (!confirmingDeleteId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmingDeleteId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmingDeleteId]);

  // Close the context menu on outside click or Escape
  useEffect(() => {
    if (!menuOpenId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpenId]);

  const confirmingConversation = confirmingDeleteId
    ? conversations.find((c) => c.id === confirmingDeleteId) ?? null
    : null;

  /** Focus the search input when the global Cmd/Ctrl+K shortcut fires. */
  useEffect(() => {
    const handler = () => {
      // Uncollapse sidebar if it's collapsed so the input becomes visible
      const { sidebarCollapsed, setSidebarCollapsed } = useChatStore.getState();
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
        // Wait a frame for the sidebar to render before focusing
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('focus-search-input', handler);
    return () => window.removeEventListener('focus-search-input', handler);
  }, []);

  const displayedConversations = searchResults ?? conversations;

  return (
    <aside
      className="relative bg-surface-light flex flex-col border-r border-surface-lighter flex-shrink-0"
      style={{ width }}
    >
      <div className="px-3 pt-2 pb-2">
        <button
          onClick={createConversation}
          className="w-full px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/25 hover:text-text transition-colors text-sm font-medium"
        >
          + New Chat
        </button>
      </div>

      {/* Search filter */}
      {conversations.length > 0 && (
        <div className="px-3 pb-2">
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

        {displayedConversations.map((convo) => (
          <button
            key={convo.id}
            type="button"
            className={`group flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors w-full text-left ${
              convo.id === activeConversationId
                ? 'bg-surface-lighter text-text'
                : 'text-text-muted hover:bg-primary/10 hover:text-text'
            }`}
            onClick={() => {
              if (editingId !== convo.id) loadMessages(convo.id);
            }}
            onDoubleClick={() => {
              setConfirmingDeleteId(null);
              setEditingId(convo.id);
              setEditingTitle(convo.title);
            }}
          >
            {editingId === convo.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 text-sm bg-transparent border-b border-primary outline-none text-text"
              />
            ) : (
              <span className="flex-1 truncate text-sm">{convo.title}</span>
            )}
            {/* Context menu trigger */}
            <span className="relative" ref={menuOpenId === convo.id ? menuRef : undefined}>
              <span
                role="button"
                tabIndex={0}
                title="Conversation options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === convo.id ? null : convo.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === convo.id ? null : convo.id);
                  }
                }}
                className={`${menuOpenId === convo.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'} text-text-dim hover:text-text transition-opacity text-xs px-1`}
              >
                ⋯
              </span>
              {menuOpenId === convo.id && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-surface-lighter bg-surface shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-primary/10 hover:text-text transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(null);
                      ipc.exportConversation(convo.id);
                    }}
                  >
                    Export Chat
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-text-muted hover:bg-accent-red/10 hover:text-accent-red transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(null);
                      setConfirmingDeleteId(convo.id);
                    }}
                  >
                    Delete Chat
                  </button>
                </div>
              )}
            </span>
          </button>
        ))}

        {conversations.length === 0 && (
          <p className="text-text-dim text-xs text-center mt-8 px-4">
            No conversations yet. Start a new chat!
          </p>
        )}

        {conversations.length > 0 && displayedConversations.length === 0 && (
          <p className="text-text-dim text-xs text-center mt-8 px-4">
            No matching conversations
          </p>
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

      {/* Delete confirmation modal */}
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
    </aside>
  );
}
