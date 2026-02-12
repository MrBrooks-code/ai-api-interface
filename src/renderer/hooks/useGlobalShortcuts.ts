/**
 * @fileoverview Global keyboard shortcuts matching ChatGPT's desktop shortcut
 * set. Registers a single `keydown` listener on `window` and dispatches
 * actions via the Zustand store and IPC client.
 */

import { useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';

/** Returns true when the platform modifier key (Cmd on macOS, Ctrl elsewhere) is held. */
function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

/**
 * Extracts plain text from the last assistant message's text content blocks.
 * Returns `null` if there is no assistant message.
 */
function getLastAssistantText(): string | null {
  const messages = useChatStore.getState().messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const texts = messages[i].content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text);
      return texts.length > 0 ? texts.join('\n') : null;
    }
  }
  return null;
}

/**
 * Extracts the last fenced code block from the last assistant message.
 * Returns `null` if no code block is found.
 */
function getLastCodeBlock(): string | null {
  const fullText = getLastAssistantText();
  if (!fullText) return null;

  const matches = [...fullText.matchAll(/```[\s\S]*?```/g)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1][0];
  // Strip the opening ```[lang] and closing ```
  const lines = last.split('\n');
  lines.shift(); // remove opening ```lang
  lines.pop(); // remove closing ```
  return lines.join('\n');
}

/**
 * Attaches global keyboard shortcut listeners matching ChatGPT's desktop
 * shortcuts. Call once from the root component — the effect registers a
 * single `keydown` handler with no reactive store dependencies.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // --- Cmd/Ctrl+Shift+O — New chat ---
      if (isModKey(e) && e.shiftKey && e.code === 'KeyO') {
        e.preventDefault();
        useChatStore.getState().setActiveConversation(null);
        useChatStore.getState().setMessages([]);
        return;
      }

      // --- Cmd/Ctrl+Shift+S — Toggle sidebar ---
      if (isModKey(e) && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        useChatStore.getState().toggleSidebar();
        return;
      }

      // --- Cmd/Ctrl+Shift+C — Copy last assistant response ---
      if (isModKey(e) && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        const text = getLastAssistantText();
        if (text) {
          navigator.clipboard.writeText(text);
        }
        return;
      }

      // --- Cmd/Ctrl+Shift+; — Copy last code block ---
      if (isModKey(e) && e.shiftKey && e.key === ';') {
        e.preventDefault();
        const code = getLastCodeBlock();
        if (code) {
          navigator.clipboard.writeText(code);
        }
        return;
      }

      // --- Cmd/Ctrl+Shift+Backspace — Request delete confirmation for current conversation ---
      if (isModKey(e) && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault();
        const { activeConversationId } = useChatStore.getState();
        if (activeConversationId) {
          window.dispatchEvent(
            new CustomEvent('request-delete-conversation', {
              detail: { conversationId: activeConversationId },
            }),
          );
        }
        return;
      }

      // --- Cmd/Ctrl+. — Stop streaming ---
      if (isModKey(e) && !e.shiftKey && e.key === '.') {
        e.preventDefault();
        const { isStreaming, activeRequestId } = useChatStore.getState();
        if (isStreaming && activeRequestId) {
          ipc.abortStream(activeRequestId);
          useChatStore.getState().setStreaming(false);
        }
        return;
      }

      // --- Shift+Escape — Focus chat input ---
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-chat-input'));
        return;
      }

      // --- Cmd/Ctrl+K — Focus conversation search ---
      if (isModKey(e) && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-search-input'));
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
