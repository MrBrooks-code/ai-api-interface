/**
 * @fileoverview Scrollable message list that auto-scrolls to the latest
 * message when new content arrives or while the assistant is streaming.
 * Consecutive tool-use messages are grouped into a single visual unit
 * via {@link ToolActivityGroup}.
 */

import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import ToolActivityGroup from './ToolActivityGroup';
import { useChatStore } from '../stores/chat-store';
import type { ChatMessage } from '../../shared/types';

/** Props accepted by {@link MessageList}. */
interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Message grouping
// ---------------------------------------------------------------------------

/** A single message rendered on its own (user text, standalone assistant). */
interface StandaloneGroup {
  type: 'standalone';
  message: ChatMessage;
}

/** A chain of messages produced by the tool-use loop, rendered as one unit. */
interface ToolChainGroup {
  type: 'tool-chain';
  messages: ChatMessage[];
}

type MessageGroup = StandaloneGroup | ToolChainGroup;

/**
 * Groups consecutive messages that form a tool-use chain into a single
 * {@link ToolChainGroup}. A chain starts with an assistant message whose
 * `stopReason` is `'tool_use'` and continues through tool-result user
 * messages and subsequent assistant responses until the model stops
 * requesting tools (or is still streaming).
 */
function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.stopReason === 'tool_use') {
      // Start of a tool-use chain.
      const chain: ChatMessage[] = [msg];
      i++;

      while (i < messages.length) {
        const next = messages[i];

        // Tool-result user messages belong to the chain.
        if (next.role === 'user' && next.content.every((b) => b.type === 'toolResult')) {
          chain.push(next);
          i++;
          continue;
        }

        // The next assistant message is part of the chain (either continues
        // with more tool calls or delivers the final answer).
        if (next.role === 'assistant') {
          chain.push(next);
          i++;
          if (next.stopReason === 'tool_use') continue;
          break;
        }

        // Any other message type ends the chain.
        break;
      }

      groups.push({ type: 'tool-chain', messages: chain });
    } else {
      groups.push({ type: 'standalone', message: msg });
      i++;
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

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

/** Renders a vertically scrolling list of message groups. */
export default function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesLoading = useChatStore((s) => s.messagesLoading);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const groups = groupMessages(messages);
  const lastMsgId = messages[messages.length - 1]?.id;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {messagesLoading ? (
          <MessageSkeletons />
        ) : (
          groups.map((group) => {
            if (group.type === 'tool-chain') {
              const chainLast = group.messages[group.messages.length - 1];
              const isGroupStreaming = isStreaming && chainLast.id === lastMsgId;
              return (
                <ToolActivityGroup
                  key={group.messages[0].id}
                  messages={group.messages}
                  isStreaming={isGroupStreaming}
                />
              );
            }

            const msg = group.message;
            const isLast = msg.id === lastMsgId;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={isLast}
                isStreaming={isStreaming && isLast && msg.role === 'assistant'}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
