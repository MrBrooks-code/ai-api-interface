/**
 * @fileoverview Side panel for rendering live previews of HTML, SVG, Mermaid,
 * Markdown, CSV, and LaTeX code blocks. Content is displayed in a sandboxed
 * iframe to prevent artifact code from accessing the host application. Mermaid
 * diagrams and LaTeX math are rendered in the renderer process (outside the
 * iframe) for security. The panel slides open and closed with a width transition.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import katex from 'katex';
import { useChatStore } from '../stores/chat-store';

const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const DEFAULT_WIDTH = 480;
const ANIMATION_MS = 300;

/** Themes where Mermaid should use its light palette. */
const LIGHT_THEMES = new Set(['catppuccin-latte', 'solarized-light']);

/** File extensions by language for downloads. */
const DOWNLOAD_EXTENSIONS: Record<string, string> = {
  html: '.html',
  svg: '.svg',
  mermaid: '.mmd',
  markdown: '.md',
  csv: '.csv',
  latex: '.tex',
};

/** Wraps raw SVG markup in a minimal HTML document for iframe display. */
function wrapSvgInHtml(svg: string): string {
  return `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; background: transparent; }
  svg { max-width: 100%; height: auto; }
</style></head><body>${svg}</body></html>`;
}

/** Generates an error page for failed renders. */
function renderErrorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><style>
  body { margin: 24px; font-family: system-ui, sans-serif; color: #ef4444;
         background: transparent; }
  pre { white-space: pre-wrap; word-break: break-word; }
</style></head><body><h3>${title}</h3><pre>${message}</pre></body></html>`;
}

/** Converts a CSV string to an HTML table. */
function csvToHtml(csv: string): string {
  const lines = csv.trim().split('\n');
  if (lines.length === 0) return '<p>Empty CSV</p>';

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const header = parseRow(lines[0]);
  const bodyRows = lines.slice(1).filter((l) => l.trim().length > 0);

  let html = `<!DOCTYPE html>
<html><head><style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%;
               font-family: system-ui, -apple-system, sans-serif;
               background: #fff; color: #1a1a1a; font-size: 11px; }
  .wrapper { width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 4px; }
  table { border-collapse: collapse; width: 100%; table-layout: auto; }
  th, td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: left;
           overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  th { background: #f3f4f6; font-weight: 600; position: sticky; top: 0; z-index: 1; }
  tr:nth-child(even) { background: #f9fafb; }
  tr:hover { background: #e5e7eb; }
</style></head><body><div class="wrapper"><table><thead><tr>`;
  for (const cell of header) html += `<th title="${escHtml(cell)}">${escHtml(cell)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    html += '<tr>';
    for (const cell of parseRow(row)) html += `<td title="${escHtml(cell)}">${escHtml(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div></body></html>';
  return html;
}

/**
 * Converts a markdown string to basic HTML. Uses a lightweight regex approach
 * for headings, bold, italic, code, links, lists, and paragraphs — no
 * external dependency needed since this is just for the preview iframe.
 */
function markdownToHtml(md: string): string {
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inCodeBlock = false;
  let inList: 'ul' | 'ol' | null = null;

  for (const rawLine of lines) {
    // Fenced code blocks
    if (rawLine.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push('</code></pre>');
        inCodeBlock = false;
      } else {
        if (inList) { htmlLines.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null; }
        htmlLines.push('<pre><code>');
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      htmlLines.push(escHtml(rawLine));
      continue;
    }

    const line = rawLine;

    // Close list if this line isn't a list item
    const isUl = /^\s*[-*+]\s/.test(line);
    const isOl = /^\s*\d+\.\s/.test(line);
    if (inList && !isUl && !isOl && line.trim().length > 0) {
      htmlLines.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlLines.push(`<h${level}>${inlineFormat(escHtml(headingMatch[2]))}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      htmlLines.push('<hr>');
      continue;
    }

    // Unordered list
    if (isUl) {
      if (inList !== 'ul') { if (inList) htmlLines.push('</ol>'); htmlLines.push('<ul>'); inList = 'ul'; }
      htmlLines.push(`<li>${inlineFormat(escHtml(line.replace(/^\s*[-*+]\s/, '')))}</li>`);
      continue;
    }

    // Ordered list
    if (isOl) {
      if (inList !== 'ol') { if (inList) htmlLines.push('</ul>'); htmlLines.push('<ol>'); inList = 'ol'; }
      htmlLines.push(`<li>${inlineFormat(escHtml(line.replace(/^\s*\d+\.\s/, '')))}</li>`);
      continue;
    }

    // Blank line
    if (line.trim().length === 0) {
      htmlLines.push('');
      continue;
    }

    // Paragraph
    htmlLines.push(`<p>${inlineFormat(escHtml(line))}</p>`);
  }

  if (inCodeBlock) htmlLines.push('</code></pre>');
  if (inList) htmlLines.push(inList === 'ul' ? '</ul>' : '</ol>');

  return `<!DOCTYPE html>
<html><head><style>
  body { margin: 24px; font-family: system-ui, sans-serif; line-height: 1.6;
         color: #1a1a1a; background: #fff; max-width: 720px; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0; padding-left: 16px; color: #6b7280; }
  table { border-collapse: collapse; } th, td { border: 1px solid #d1d5db; padding: 6px 10px; }
  img { max-width: 100%; }
  a { color: #2563eb; }
  h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
</style></head><body>${htmlLines.join('\n')}</body></html>`;
}

/** Applies inline markdown formatting (bold, italic, code, links). */
function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Renders a LaTeX string to HTML via KaTeX. */
function latexToHtml(tex: string): string {
  try {
    const rendered = katex.renderToString(tex, {
      displayMode: true,
      throwOnError: false,
      output: 'html',
    });
    return `<!DOCTYPE html>
<html><head>
<style>
  body { margin: 24px; display: flex; justify-content: center; align-items: flex-start;
         min-height: 100vh; background: #fff; }
  .katex { font-size: 1.4em; }
  .katex-error { color: #ef4444; }
</style>
</head><body>${rendered}</body></html>`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return renderErrorHtml('LaTeX Render Error', msg);
  }
}

/** Resizable preview panel that slides open/closed and renders content in a sandboxed iframe. */
export default function ArtifactPanel() {
  const previewPanel = useChatStore((s) => s.previewPanel);
  const closePreviewPanel = useChatStore((s) => s.closePreviewPanel);
  const previewCloseRequest = useChatStore((s) => s.previewCloseRequest);
  const theme = useChatStore((s) => s.theme);

  const [targetWidth, setTargetWidth] = useState(DEFAULT_WIDTH);
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  const isDragging = useRef(false);
  const isClosing = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpen = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  const [srcdoc, setSrcdoc] = useState('');
  const mermaidIdCounter = useRef(0);

  // Slide open when previewPanel becomes non-null, unmount when it goes null externally
  useEffect(() => {
    if (previewPanel) {
      // Cancel any pending close timeout so it doesn't unmount the new preview
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isClosing.current = false;
      if (!mounted) {
        // Fresh open: mount at width 0, animation triggered by layout effect below
        setAnimatedWidth(0);
        setMounted(true);
        pendingOpen.current = true;
      }
      // If already mounted (swapping content), width stays as-is — no animation needed
    } else if (mounted) {
      // Store cleared previewPanel externally (e.g. conversation switch/delete)
      setSrcdoc('');
      setAnimatedWidth(0);
      setMounted(false);
      isClosing.current = false;
    }
  }, [previewPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // After mounting at width 0, force a reflow then set target width so the
  // CSS transition reliably animates. This replaces the double-rAF approach
  // which could be collapsed by the browser under load.
  useLayoutEffect(() => {
    if (pendingOpen.current && asideRef.current) {
      pendingOpen.current = false;
      void asideRef.current.offsetWidth; // force reflow at width 0
      setAnimatedWidth(targetWidth);
    }
  }, [mounted, targetWidth]);

  // Animated close: shrink to 0, then unmount after transition
  const handleClose = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    setSrcdoc('');
    setAnimatedWidth(0);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setMounted(false);
      closePreviewPanel();
    }, ANIMATION_MS);
  }, [closePreviewPanel]);

  // Listen for external close requests (e.g. toggling the Preview button)
  const prevCloseRequest = useRef(previewCloseRequest);
  useEffect(() => {
    if (previewCloseRequest !== prevCloseRequest.current) {
      prevCloseRequest.current = previewCloseRequest;
      if (mounted) handleClose();
    }
  }, [previewCloseRequest, mounted, handleClose]);

  // Render content to srcdoc whenever previewPanel or theme changes
  useEffect(() => {
    if (!previewPanel) return;

    const { content, language } = previewPanel;

    if (language === 'html') {
      setSrcdoc(content);
    } else if (language === 'svg') {
      setSrcdoc(wrapSvgInHtml(content));
    } else if (language === 'mermaid') {
      const mermaidTheme = LIGHT_THEMES.has(theme) ? 'default' : 'dark';
      mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'strict' });

      const id = `mermaid-preview-${mermaidIdCounter.current++}`;
      mermaid.render(id, content)
        .then(({ svg }) => setSrcdoc(wrapSvgInHtml(svg)))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setSrcdoc(renderErrorHtml('Mermaid Parse Error', msg));
        });
    } else if (language === 'markdown') {
      setSrcdoc(markdownToHtml(content));
    } else if (language === 'csv') {
      setSrcdoc(csvToHtml(content));
    } else if (language === 'latex') {
      setSrcdoc(latexToHtml(content));
    }
  }, [previewPanel, theme]);

  // Resize handlers — mirror the Sidebar pattern but for left-edge drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
    setTargetWidth(newWidth);
    setAnimatedWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startResize = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Escape key closes the panel
  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mounted, handleClose]);

  // Copy raw source to clipboard
  const handleCopy = useCallback(async () => {
    if (!previewPanel) return;
    await navigator.clipboard.writeText(previewPanel.content);
  }, [previewPanel]);

  // Download the raw source with appropriate extension
  const handleDownload = useCallback(() => {
    if (!previewPanel) return;
    const ext = DOWNLOAD_EXTENSIONS[previewPanel.language] ?? '.txt';
    const blob = new Blob([previewPanel.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [previewPanel]);

  if (!mounted) return null;

  return (
    <aside
      ref={asideRef}
      className="relative bg-surface flex flex-col border-l-2 border-text-muted/40 flex-shrink-0 overflow-hidden"
      style={{
        width: animatedWidth,
        transition: isDragging.current ? 'none' : `width ${ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      {/* Left-edge resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
      />

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-lighter flex-shrink-0 min-w-0">
        <span className="text-sm font-medium text-text truncate">
          {previewPanel?.title}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="text-xs text-text-muted hover:text-text transition-colors px-1.5 py-0.5 whitespace-nowrap"
            title="Copy source code"
          >
            Copy Code
          </button>
          <button
            onClick={handleDownload}
            className="text-xs text-text-muted hover:text-text transition-colors px-1.5 py-0.5 whitespace-nowrap"
            title="Download source file"
          >
            Download
          </button>
          <button
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors p-0.5"
            title="Close preview (Esc)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sandboxed preview iframe */}
      <iframe
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        className="flex-1 w-full bg-white border-0"
        title="Artifact preview"
      />
    </aside>
  );
}
