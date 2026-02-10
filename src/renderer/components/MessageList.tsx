/**
 * @fileoverview Scrollable message list that auto-scrolls to the latest
 * message when new content arrives or while the assistant is streaming.
 */

import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { useChatStore } from '../stores/chat-store';
import type { ChatMessage } from '../../shared/types';

/** Props accepted by {@link MessageList}. */
interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

/** Placeholder skeletons shown while messages are loading from the database. */
function MessageSkeletons() {
  const widths = ['70%', '45%', '60%'];
  return (
    <>
      {widths.map((width, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div
            className="h-16 rounded-2xl bg-surface-light animate-pulse"
            style={{ width }}
          />
        </div>
      ))}
    </>
  );
}

/** Renders a vertically scrolling list of {@link MessageBubble} components. */
export default function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesLoading = useChatStore((s) => s.messagesLoading);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {messagesLoading ? (
          <MessageSkeletons />
        ) : (
          messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={index === messages.length - 1}
              isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
