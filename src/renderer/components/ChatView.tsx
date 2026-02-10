import React, { useEffect, useState } from 'react';
import MessageList from './MessageList';
import InputBar from './InputBar';
import { useChat } from '../hooks/useChat';
import { useChatStore } from '../stores/chat-store';
import { ipc } from '../lib/ipc-client';
import type { LoginBanner } from '../../shared/types';

const DEFAULT_BANNER: LoginBanner = {
  title: 'Bedrock Chat',
  message: 'Chat with Claude Sonnet 4.5 via Amazon Bedrock',
};

export default function ChatView() {
  const { messages, isStreaming, sendMessage, abortStream } = useChat();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const [banner, setBanner] = useState<LoginBanner>(DEFAULT_BANNER);

  useEffect(() => {
    ipc.getAdminConfig().then((config) => {
      setBanner(config.loginBanner);
    }).catch(() => {
      // Fall back to defaults on any error
    });
  }, []);

  return (
    <div className="flex flex-col h-full pt-8">
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
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
        disabled={!connectionStatus.connected}
      />
    </div>
  );
}
