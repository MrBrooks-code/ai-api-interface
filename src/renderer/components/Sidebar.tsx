import React from 'react';
import { useConversations } from '../hooks/useConversations';
import { useChatStore } from '../stores/chat-store';

export default function Sidebar() {
  const { conversations, activeConversationId, loadMessages, createConversation, deleteConversation } =
    useConversations();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const setShowSettings = useChatStore((s) => s.setShowSettings);

  return (
    <aside className="w-64 bg-surface-light flex flex-col border-r border-surface-lighter flex-shrink-0">
      <div className="px-3 pt-2 pb-2">
        <button
          onClick={createConversation}
          className="w-full px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {conversations.map((convo) => (
          <div
            key={convo.id}
            className={`group flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors ${
              convo.id === activeConversationId
                ? 'bg-surface-lighter text-text'
                : 'text-text-muted hover:bg-surface-lighter/50'
            }`}
            onClick={() => loadMessages(convo.id)}
          >
            <span className="flex-1 truncate text-sm">{convo.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(convo.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-accent-red transition-opacity text-xs px-1"
            >
              ✕
            </button>
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-text-dim text-xs text-center mt-8 px-4">
            No conversations yet. Start a new chat!
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
    </aside>
  );
}
