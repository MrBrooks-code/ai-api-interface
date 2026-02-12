/**
 * @fileoverview Renders a markdown string with GitHub-Flavored Markdown
 * tables/task lists and syntax-highlighted code fences via highlight.js.
 * Styled for a polished, ChatGPT-like reading experience with soft edges,
 * a dedicated code-block header bar, and clean typography.
 */

import React, { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useChatStore } from '../stores/chat-store';

/** Languages that support live preview in the artifact panel. */
const PREVIEWABLE_LANGUAGES = new Set(['html', 'svg', 'mermaid', 'markdown', 'csv', 'latex']);

/** Maps language aliases to canonical preview language names. */
const LANGUAGE_ALIASES: Record<string, string> = {
  md: 'markdown',
  tex: 'latex',
  katex: 'latex',
};

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

/** Fenced code block with a header bar containing the language label, preview, and copy buttons. */
function CodeBlock({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const setPreviewPanel = useChatStore((s) => s.setPreviewPanel);
  const previewPanel = useChatStore((s) => s.previewPanel);
  const requestClosePreview = useChatStore((s) => s.requestClosePreview);

  const rawLanguage = extractLanguage(children);
  const language = rawLanguage ? (LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage) : null;
  const isPreviewable = language != null && PREVIEWABLE_LANGUAGES.has(language);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Display labels for preview panel titles. */
  const TITLE_LABELS: Record<string, string> = {
    html: 'HTML', svg: 'SVG', mermaid: 'Mermaid',
    markdown: 'Markdown', csv: 'CSV', latex: 'LaTeX',
  };

  const handlePreview = () => {
    const content = preRef.current?.textContent ?? '';
    // Toggle: if the panel is already showing this block's content, close it
    if (previewPanel && previewPanel.content === content) {
      requestClosePreview();
      return;
    }
    setPreviewPanel({
      visible: true,
      content,
      language: language as 'html' | 'svg' | 'mermaid' | 'markdown' | 'csv' | 'latex',
      title: `${TITLE_LABELS[language!] ?? language!.toUpperCase()} Preview`,
    });
  };

  return (
    <div className="code-block-wrapper my-3 rounded-xl overflow-hidden border border-white/[0.06]">
      {/* Header bar — language label only */}
      <div className="flex items-center px-4 py-2 bg-[var(--color-code-bg)] border-b border-white/[0.06]">
        <span className="text-xs text-text-muted select-none">
          {rawLanguage ?? 'code'}
        </span>
      </div>
      {/* Code body */}
      <pre
        ref={preRef}
        className="bg-[var(--color-code-bg)] overflow-x-auto !mt-0 !rounded-none"
        {...props}
      >
        {children}
      </pre>
      {/* Footer bar — action buttons at bottom-right */}
      <div className="flex items-center justify-end gap-3 px-4 py-2 bg-[var(--color-code-bg)] border-t border-white/[0.06]">
        {isPreviewable && (
          <button
            onClick={handlePreview}
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            Preview
          </button>
        )}
        <button
          onClick={handleCopy}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
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
                <code
                  className="inline-code px-1.5 py-0.5 rounded-md text-[0.875em] font-mono
                    bg-surface-lighter/70 text-text-muted"
                  {...props}
                >
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
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.06]">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
