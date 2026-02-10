/**
 * @fileoverview Renders a markdown string with GitHub-Flavored Markdown
 * tables/task lists and syntax-highlighted code fences via highlight.js.
 */

import React, { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

/** Props accepted by {@link MarkdownRenderer}. */
interface Props {
  content: string;
}

/** Extracts the language name from a code element's className (e.g. "language-typescript" → "typescript"). */
function extractLanguage(children: React.ReactNode): string | null {
  const child = React.Children.toArray(children)[0];
  if (React.isValidElement(child)) {
    const className = (child.props as { className?: string }).className ?? '';
    const match = className.match(/language-(\w+)/);
    return match ? match[1] : null;
  }
  return null;
}

/** Fenced code block with a copy button and optional language label. */
function CodeBlock({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const language = extractLanguage(children);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      {language && (
        <span className="absolute top-2 left-3 text-[10px] uppercase tracking-wide text-text-dim select-none z-10">
          {language}
        </span>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 px-2 py-1 text-xs rounded bg-surface-lighter/80 text-text-muted
          opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-lighter hover:text-text"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre
        ref={preRef}
        className="bg-[var(--color-code-bg)] rounded-lg overflow-x-auto"
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

/** Renders a markdown string with GFM extensions and syntax highlighting. */
export default function MarkdownRenderer({ content }: Props) {
  const plugins = useMemo(() => ({
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHighlight],
  }), []);

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={plugins.remarkPlugins}
        rehypePlugins={plugins.rehypePlugins}
        components={{
          pre: ({ children, ...props }) => (
            <CodeBlock {...props}>{children}</CodeBlock>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-surface-lighter px-1.5 py-0.5 rounded text-sm" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
