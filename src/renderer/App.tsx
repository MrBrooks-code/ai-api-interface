import React, { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsPanel from './components/SettingsPanel';
import { useChatStore } from './stores/chat-store';
import { ipc } from './lib/ipc-client';
import type { ThemeId } from '../shared/types';

const VALID_THEMES: ThemeId[] = [
  'catppuccin-mocha', 'catppuccin-latte', 'nord', 'tokyo-night',
  'rose-pine', 'gruvbox-dark', 'solarized-light',
];

export function applyThemeClass(themeId: ThemeId) {
  const el = document.documentElement;
  el.className = el.className.replace(/\btheme-\S+/g, '').trim();
  el.classList.add(`theme-${themeId}`);
}

export default function App() {
  const showSettings = useChatStore((s) => s.showSettings);
  const setTheme = useChatStore((s) => s.setTheme);

  useEffect(() => {
    ipc.getSetting('theme').then((saved) => {
      const theme = VALID_THEMES.includes(saved as ThemeId)
        ? (saved as ThemeId)
        : 'catppuccin-mocha';
      setTheme(theme);
      applyThemeClass(theme);
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
