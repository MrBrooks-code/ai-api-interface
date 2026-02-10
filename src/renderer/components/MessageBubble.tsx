/**
 * @fileoverview Single message bubble that delegates rendering of each
 * content block to the appropriate sub-component (markdown, tool call,
 * image, or document preview).
 */

import React from 'react';
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

  // Don't show messages that only contain tool results (they're displayed inline)
  const hasOnlyToolResults = message.content.every((b) => b.type === 'toolResult');
  if (isUser && hasOnlyToolResults) {
    return (
      <div className="space-y-2">
        {message.content.map((block, i) => renderBlock(block, i))}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary/20 text-text'
            : 'bg-surface-light text-text'
        }`}
      >
        <div className="space-y-2">
          {message.content.map((block, i) => renderBlock(block, i))}
        </div>

        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  );
}
