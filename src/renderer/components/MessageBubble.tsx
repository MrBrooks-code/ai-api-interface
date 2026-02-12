/**
 * @fileoverview Single message bubble that delegates rendering of each
 * content block to the appropriate sub-component (markdown, tool call,
 * image, or document preview).
 */

import React, { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolCallCard from './ToolCallCard';
import FilePreview from './FilePreview';
import type { ChatMessage, ContentBlock } from '../../shared/types';

/** Props accepted by {@link MessageBubble}. */
interface Props {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}

/** Formats a Unix-ms timestamp to a localized time string (e.g. "2:30 PM"). */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Routes a single content block to the correct visual component. */
function renderBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case 'text':
      return block.text ? (
        <MarkdownRenderer key={index} content={block.text} />
      ) : null;

    case 'image':
      return <FilePreview key={index} block={block} />;

    case 'document':
      return (
        <div
          key={index}
          className="flex items-center gap-2 px-3 py-2 bg-surface-lighter rounded-lg text-sm"
        >
          <span className="text-primary">📄</span>
          <span className="text-text-muted">{block.name}</span>
        </div>
      );

    case 'toolUse':
      return <ToolCallCard key={index} block={block} type="call" />;

    case 'toolResult':
      return <ToolCallCard key={index} block={block} type="result" />;

    default:
      return null;
  }
}

/** Renders a single chat message with alignment based on role. */
export default function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Detect whether any block has visible content
  const hasVisibleContent = message.content.some(
    (b) => (b.type === 'text' && b.text.length > 0) || b.type !== 'text'
  );

  /** Copies all text blocks in the message to the clipboard. */
  const handleCopyMessage = async () => {
    const text = message.content
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

  // Don't show messages that only contain tool results (they're displayed inline)
  const hasOnlyToolResults = message.content.every((b) => b.type === 'toolResult');
  if (isUser && hasOnlyToolResults) {
    return (
      <div className="space-y-2">
        {message.content.map((block, i) => renderBlock(block, i))}
      </div>
    );
  }

  // Thinking state — render as standalone animated text, no bubble
  if (isStreaming && !hasVisibleContent) {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-1 px-4 py-2 text-text-muted text-sm">
          <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
          <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
          <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
          <span className="ml-1.5 italic text-text-muted">Thinking…</span>
        </div>
      </div>
    );
  }

  // Assistant messages — render content directly in the centered column, no bubble
  if (!isUser) {
    return (
      <div className="group/msg relative text-text">
        <div className="space-y-2">
          {message.content.map((block, i) => renderBlock(block, i))}
        </div>

        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
        )}

        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-text-dim">
            {formatTime(message.timestamp)}
          </span>
          <button
            onClick={handleCopyMessage}
            className="text-[10px] text-text-dim opacity-0 group-hover/msg:opacity-60 hover:!opacity-100 transition-opacity"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  // User messages — keep in a right-aligned bubble
  return (
    <div className="flex justify-end">
      <div className="rounded-2xl px-4 py-3 max-w-[85%] bg-surface-light text-text overflow-hidden">
        <div className="space-y-2">
          {message.content.map((block, i) => renderBlock(block, i))}
        </div>

        <div className="flex items-center mt-1">
          <span className="text-[10px] text-text-dim">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
