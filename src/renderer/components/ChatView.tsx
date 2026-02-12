/**
 * @fileoverview Primary chat view containing the message list, input bar, and
 * the admin-configurable logon banner (CMMC AC.L2-3.1.9) shown when no
 * conversation is active.
 */

import React, { useEffect, useRef, useState } from 'react';
import MessageList from './MessageList';
import InputBar from './InputBar';
import { useChat } from '../hooks/useChat';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import type { LoginBanner, CustomThemeConfig } from '../../shared/types';

/** Fallback banner shown when `admin-config.json` is missing or unreadable. */
const DEFAULT_BANNER: LoginBanner = {
  title: 'Bedrock Chat',
  message: 'Chat with Claude Sonnet 4.5 via Amazon Bedrock',
  titlebar: 'Bedrock Chat',
};

/** Displays the conversation messages or the logon banner when idle. */
export default function ChatView() {
  const { messages, isStreaming, sendMessage, abortStream } = useChat();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const autoConnecting = useChatStore((s) => s.autoConnecting);
  const autoConnectSsoStatus = useChatStore((s) => s.autoConnectSsoStatus);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const [banner, setBanner] = useState<LoginBanner>(DEFAULT_BANNER);
  const [customTheme, setCustomTheme] = useState<CustomThemeConfig | undefined>();

  useEffect(() => {
    ipc.getAdminConfig().then((config) => {
      setBanner(config.loginBanner);
      setCustomTheme(config.customTheme);
    }).catch(() => {
      // Fall back to defaults on any error
    });
  }, []);

  const ssoStage = autoConnectSsoStatus?.stage;
  const showOverlay = autoConnecting && ssoStage !== undefined;

  // Counter that increments each time we enter the empty/welcome state,
  // used as a React key to re-mount and trigger the fade-in animation.
  const welcomeKeyRef = useRef(0);
  const prevShowWelcome = useRef(false);
  const showWelcome = !showOverlay && messages.length === 0;

  if (showWelcome && !prevShowWelcome.current) {
    welcomeKeyRef.current += 1;
  }
  prevShowWelcome.current = showWelcome;

  return (
    <div className="flex flex-col h-full">
      {showOverlay ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            {ssoStage === 'error' ? (
              <>
                <p className="text-accent-red text-base font-medium mb-2">
                  Connection failed
                </p>
                <p className="text-text-muted text-sm mb-4">
                  {autoConnectSsoStatus?.error ?? 'An unknown error occurred.'}
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-accent text-sm underline hover:no-underline"
                >
                  Open Settings
                </button>
              </>
            ) : ssoStage === 'polling' && autoConnectSsoStatus?.userCode ? (
              <>
                <p className="text-text-muted text-sm mb-3">
                  Complete sign-in in your browser
                </p>
                <p className="text-text font-mono text-3xl font-bold tracking-widest mb-3">
                  {autoConnectSsoStatus.userCode}
                </p>
                <p className="text-text-muted text-xs">
                  Waiting for authorization…
                </p>
              </>
            ) : (
              <>
                <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-text-muted text-sm">Connecting to AWS…</p>
              </>
            )}
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div key={welcomeKeyRef.current} className="flex-1 flex items-center justify-center animate-fade-in">
          <div className="text-center max-w-md px-4">
            {customTheme?.logo && (
              <img
                src={customTheme.logo}
                alt={customTheme.name}
                className="max-h-16 mx-auto mb-4"
              />
            )}
            <h1 className="text-2xl font-semibold text-text mb-2">{banner.title}</h1>
            <p className="text-text-muted text-sm mb-6 whitespace-pre-line">
              {banner.message}
            </p>
            {!connectionStatus.connected && (
              <p className="text-accent-yellow text-sm">
                Connect to AWS to start chatting. Click the connection status in the sidebar.
              </p>
            )}
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isStreaming={isStreaming} />
      )}

      <InputBar
        onSend={sendMessage}
        onAbort={abortStream}
        isStreaming={isStreaming}
        disabled={!connectionStatus.connected || autoConnecting}
      />
    </div>
  );
}
