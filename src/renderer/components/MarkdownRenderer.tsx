/**
 * @fileoverview Renders a markdown string with GitHub-Flavored Markdown
 * tables/task lists and syntax-highlighted code fences via highlight.js.
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

/** Props accepted by {@link MarkdownRenderer}. */
interface Props {
  content: string;
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
            <pre className="bg-[#0d1117] rounded-lg overflow-x-auto my-2" {...props}>
              {children}
            </pre>
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
