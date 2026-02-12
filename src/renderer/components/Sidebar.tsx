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
  const { conversations, activeConversationId, loadMessages, createConversation, deleteConversation } =
    useConversations();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const draftTitle = useChatStore((s) => s.draftTitle);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);

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
            onClick={() => loadMessages(convo.id)}
          >
            <span className="flex-1 truncate text-sm">{convo.title}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(convo.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  deleteConversation(convo.id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-text-dim hover:text-accent-red transition-opacity text-xs px-1"
            >
              ✕
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
    </aside>
  );
}
