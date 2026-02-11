/**
 * @fileoverview Renders a multi-step tool-use chain as a single assistant
 * bubble. Intermediate tool calls, results, and "thinking" text are collapsed
 * behind a compact summary bar, while the final answer is displayed
 * prominently below.
 */

import React, { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolCallCard from './ToolCallCard';
import type { ChatMessage, ContentBlock } from '../../shared/types';

/** Props accepted by {@link ToolActivityGroup}. */
interface Props {
  /** All messages in the tool-use chain, in chronological order. */
  messages: ChatMessage[];
  /** Whether the last message in this chain is currently streaming. */
  isStreaming: boolean;
}

/** Formats a Unix-ms timestamp to a localized time string (e.g. "2:30 PM"). */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Displays a tool-use chain as a single assistant bubble with a collapsible
 * activity summary and the final response text.
 */
export default function ToolActivityGroup({ messages, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastMsg = messages[messages.length - 1];

  // Chain is fully complete when the final message is an assistant with a
  // terminal stop reason (anything other than 'tool_use').
  const chainComplete =
    lastMsg.role === 'assistant' &&
    lastMsg.stopReason != null &&
    lastMsg.stopReason !== 'tool_use';

  // Collect unique tool names across the entire chain.
  const toolNames: string[] = [];
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'toolUse' && !toolNames.includes(block.name)) {
        toolNames.push(block.name);
      }
    }
  }

  // Split into activity (intermediate steps) and the final response.
  // The final response is the last assistant message when it isn't requesting
  // more tools (i.e. it's either complete or still streaming the answer).
  const hasFinalResponse =
    lastMsg.role === 'assistant' && lastMsg.stopReason !== 'tool_use';
  const activityMessages = hasFinalResponse ? messages.slice(0, -1) : messages;
  const finalMsg = hasFinalResponse ? lastMsg : null;

  const hasVisibleText =
    finalMsg?.content.some((b) => b.type === 'text' && b.text.length > 0) ??
    false;

  // Show thinking dots when streaming but no answer text has arrived yet.
  const showThinking = isStreaming && !hasVisibleText;

  const summaryLabel = chainComplete
    ? `Used ${toolNames.length} tool${toolNames.length !== 1 ? 's' : ''}`
    : `Using tool${toolNames.length !== 1 ? 's' : ''}`;

  /** Copies only the final answer text to the clipboard. */
  const handleCopy = async () => {
    if (!finalMsg) return;
    const text = finalMsg.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail if the window isn't focused
    }
  };

  return (
    <div className="group/msg relative flex justify-start">
      <div className="max-w-full rounded-2xl px-4 py-3 bg-surface-light text-text overflow-hidden">
        {/* Collapsible activity summary bar */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-accent-yellow text-sm">&#9881;&#65039;</span>
          <span className="text-sm font-medium text-text-muted">
            {summaryLabel}
          </span>
          <span className="text-xs text-text-dim truncate">
            {toolNames.join(', ')}
          </span>
          {!chainComplete && (
            <span className="flex-shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
          )}
          <span className="text-text-dim text-xs ml-auto flex-shrink-0">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        </button>

        {/* Expanded intermediate steps */}
        {expanded && (
          <div className="border-l-2 border-surface-lighter pl-3 mt-2 space-y-1">
            {activityMessages.map((msg) => (
              <div key={msg.id} className="space-y-1">
                {msg.content.map((block, j) => {
                  if (block.type === 'text' && block.text) {
                    return (
                      <p key={j} className="text-xs text-text-muted my-1">
                        {block.text}
                      </p>
                    );
                  }
                  if (block.type === 'toolUse') {
                    return <ToolCallCard key={j} block={block} type="call" />;
                  }
                  if (block.type === 'toolResult') {
                    return <ToolCallCard key={j} block={block} type="result" />;
                  }
                  return null;
                })}
              </div>
            ))}
          </div>
        )}

        {/* Thinking indicator while waiting for the final answer */}
        {showThinking && (
          <div className="flex items-center gap-1 mt-3 text-text-muted text-sm">
            <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
            <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
            <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
            <span className="ml-1.5 italic">Thinking&hellip;</span>
          </div>
        )}

        {/* Final answer text */}
        {finalMsg && hasVisibleText && (
          <div className="mt-3 space-y-2">
            {finalMsg.content.map((block, i) =>
              block.type === 'text' && block.text ? (
                <MarkdownRenderer key={i} content={block.text} />
              ) : null,
            )}
          </div>
        )}

        {/* Streaming cursor */}
        {isStreaming && hasVisibleText && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
        )}

        {/* Timestamp and copy action */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-text-dim">
            {formatTime(lastMsg.timestamp)}
          </span>
          {hasVisibleText && (
            <button
              onClick={handleCopy}
              className="text-[10px] text-text-dim opacity-0 group-hover/msg:opacity-60 hover:!opacity-100 transition-opacity ml-3"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
