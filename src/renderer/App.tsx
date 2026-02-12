/**
 * @fileoverview Root application component. Renders the top-level layout
 * (title bar, sidebar, chat view, settings modal) and restores the persisted
 * color theme on mount.
 */

import React, { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsPanel from './components/SettingsPanel';
import { useChatStore } from './stores/chat-store';
import { ipc } from './lib/ipc-client';
import { useAutoConnect } from './hooks/useAutoConnect';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import type { ThemeId, BuiltInThemeId, CustomThemeConfig, ThemeColors } from '../shared/types';

/** Built-in theme identifiers the app always recognizes. */
const BUILT_IN_THEMES: BuiltInThemeId[] = [
  'catppuccin-mocha', 'catppuccin-latte', 'nord', 'tokyo-night',
  'rose-pine', 'gruvbox-dark', 'solarized-light',
];

/** Maps camelCase {@link ThemeColors} keys to their CSS custom property names. */
const COLOR_KEY_TO_CSS_VAR: Record<keyof Required<ThemeColors>, string> = {
  surface: '--color-surface',
  surfaceLight: '--color-surface-light',
  surfaceLighter: '--color-surface-lighter',
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  text: '--color-text',
  textMuted: '--color-text-muted',
  textDim: '--color-text-dim',
  accentGreen: '--color-accent-green',
  accentRed: '--color-accent-red',
  accentYellow: '--color-accent-yellow',
  accentPeach: '--color-accent-peach',
  codeBg: '--color-code-bg',
  scrollbarThumb: '--color-scrollbar-thumb',
  scrollbarThumbHover: '--color-scrollbar-thumb-hover',
};

/** All CSS variable names managed by the theme system, used for cleanup. */
const ALL_CSS_VARS = Object.values(COLOR_KEY_TO_CSS_VAR);

/**
 * Module-level storage for the admin-defined custom theme config.
 * Set once during startup from the admin config IPC call.
 */
let customThemeConfig: CustomThemeConfig | undefined;

/** Returns the current custom theme config, if one was loaded from admin-config.json. */
export function getCustomThemeConfig(): CustomThemeConfig | undefined {
  return customThemeConfig;
}

/** Removes all inline CSS custom properties set by the custom theme. */
function clearCustomProperties(): void {
  const style = document.documentElement.style;
  for (const cssVar of ALL_CSS_VARS) {
    style.removeProperty(cssVar);
  }
}

/**
 * Applies the given theme to the document root. For built-in themes, swaps the
 * CSS class. For the custom theme, applies the base theme class then overlays
 * inline CSS custom property overrides.
 */
export function applyThemeClass(themeId: ThemeId) {
  const el = document.documentElement;

  // Always clear inline overrides first to prevent bleed between themes
  clearCustomProperties();

  // Swap the theme class
  el.className = el.className.replace(/\btheme-\S+/g, '').trim();

  if (themeId === 'custom' && customThemeConfig) {
    // Apply base theme class, then overlay color overrides
    const base = customThemeConfig.baseTheme ?? 'catppuccin-mocha';
    el.classList.add(`theme-${base}`);

    if (customThemeConfig.colors) {
      const style = el.style;
      for (const [key, cssVar] of Object.entries(COLOR_KEY_TO_CSS_VAR)) {
        const value = customThemeConfig.colors[key as keyof ThemeColors];
        if (value) {
          style.setProperty(cssVar, value);
        }
      }
    }
  } else {
    el.classList.add(`theme-${themeId}`);
  }
}

/** Root shell that composes the sidebar, chat area, and settings modal. */
export default function App() {
  const showSettings = useChatStore((s) => s.showSettings);
  const sidebarCollapsed = useChatStore((s) => s.sidebarCollapsed);
  const setTheme = useChatStore((s) => s.setTheme);
  const setSystemPrompt = useChatStore((s) => s.setSystemPrompt);
  const [titlebar, setTitlebar] = useState('');

  useAutoConnect();
  useGlobalShortcuts();

  useEffect(() => {
    // Fetch admin config first so customThemeConfig is available before restoring the saved theme
    ipc.getAdminConfig().then((config) => {
      setTitlebar(config.loginBanner.titlebar);
      customThemeConfig = config.customTheme;

      // Build the set of valid themes — include 'custom' only if admin defined one
      const validThemes: ThemeId[] = [...BUILT_IN_THEMES];
      if (customThemeConfig) validThemes.push('custom');

      return ipc.getSetting('theme').then((saved) => {
        const theme = validThemes.includes(saved as ThemeId)
          ? (saved as ThemeId)
          : 'catppuccin-mocha';
        setTheme(theme);
        applyThemeClass(theme);
      });
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
      <div className="titlebar-drag w-full h-8 flex-shrink-0 flex items-center justify-center pl-20">
        <span className="text-xs text-text-muted font-medium">{titlebar}</span>
      </div>
      <ErrorBoundary>
        <div className="flex flex-1 min-h-0">
          {!sidebarCollapsed && <Sidebar />}
          <main className="flex-1 flex flex-col min-w-0">
            <ChatView />
          </main>
        </div>

        {showSettings && <SettingsPanel />}
      </ErrorBoundary>
    </div>
  );
}
