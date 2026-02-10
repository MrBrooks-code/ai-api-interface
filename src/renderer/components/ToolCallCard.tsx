/**
 * @fileoverview Collapsible card that displays either a tool invocation
 * (name + JSON input) or a tool result (success/error status + output).
 */

import React, { useState } from 'react';
import type { ToolUseBlock, ToolResultBlock } from '../../shared/types';

/** Props for rendering a tool invocation request. */
interface CallProps {
  block: ToolUseBlock;
  type: 'call';
}

/** Props for rendering a tool execution result. */
interface ResultProps {
  block: ToolResultBlock;
  type: 'result';
}

/** Discriminated union of call and result props. */
type Props = CallProps | ResultProps;

/** Expandable card showing tool call details or execution results. */
export default function ToolCallCard({ block, type }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (type === 'call' && block.type === 'toolUse') {
    return (
      <div className="border border-surface-lighter rounded-lg overflow-hidden my-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-lighter/30 transition-colors"
        >
          <span className="text-accent-yellow text-sm">⚙️</span>
          <span className="text-sm font-medium text-text">
            Tool: {block.name}
          </span>
          <span className="text-text-dim text-xs ml-auto">
            {expanded ? '▼' : '▶'}
          </span>
        </button>
        {expanded && (
          <div className="px-3 py-2 border-t border-surface-lighter bg-surface/50">
            <pre className="text-xs text-text-muted overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (type === 'result' && block.type === 'toolResult') {
    const isError = block.status === 'error';
    return (
      <div
        className={`border rounded-lg overflow-hidden my-2 ${
          isError ? 'border-accent-red/30' : 'border-accent-green/30'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-lighter/30 transition-colors"
        >
          <span className={`text-sm ${isError ? 'text-accent-red' : 'text-accent-green'}`}>
            {isError ? '✗' : '✓'}
          </span>
          <span className="text-sm text-text-muted">
            Tool Result
          </span>
          <span className="text-text-dim text-xs ml-auto">
            {expanded ? '▼' : '▶'}
          </span>
        </button>
        {expanded && (
          <div className="px-3 py-2 border-t border-surface-lighter bg-surface/50">
            <pre className="text-xs text-text-muted overflow-x-auto whitespace-pre-wrap">
              {block.content}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return null;
}
