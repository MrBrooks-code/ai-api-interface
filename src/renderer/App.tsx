/**
 * @fileoverview Root application component. Renders the top-level layout
 * (title bar, sidebar, chat view, settings modal) and restores the persisted
 * color theme on mount.
 */

import React, { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsPanel from './components/SettingsPanel';
import { useChatStore } from './stores/chat-store';
import { ipc } from './lib/ipc-client';
import type { ThemeId } from '../shared/types';

/** Theme identifiers the app recognizes when restoring a saved preference. */
const VALID_THEMES: ThemeId[] = [
  'catppuccin-mocha', 'catppuccin-latte', 'nord', 'tokyo-night',
  'rose-pine', 'gruvbox-dark', 'solarized-light',
];

/**
 * Replaces the active `theme-*` CSS class on the document root element.
 * Called on startup and whenever the user changes the theme in settings.
 */
export function applyThemeClass(themeId: ThemeId) {
  const el = document.documentElement;
  el.className = el.className.replace(/\btheme-\S+/g, '').trim();
  el.classList.add(`theme-${themeId}`);
}

/** Root shell that composes the sidebar, chat area, and settings modal. */
export default function App() {
  const showSettings = useChatStore((s) => s.showSettings);
  const setTheme = useChatStore((s) => s.setTheme);
  const setSystemPrompt = useChatStore((s) => s.setSystemPrompt);

  useEffect(() => {
    ipc.getSetting('theme').then((saved) => {
      const theme = VALID_THEMES.includes(saved as ThemeId)
        ? (saved as ThemeId)
        : 'catppuccin-mocha';
      setTheme(theme);
      applyThemeClass(theme);
    });
    ipc.getSetting('systemPrompt').then((saved) => {
      if (typeof saved === 'string' && saved.length > 0) {
        setSystemPrompt(saved);
      }
    });
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface">
      {/* Draggable title bar strip — normal flow, not an overlay */}
      <div className="titlebar-drag w-full h-8 flex-shrink-0" />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <ChatView />
        </main>
      </div>

      {showSettings && <SettingsPanel />}
    </div>
  );
}
