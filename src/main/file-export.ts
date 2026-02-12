/**
 * @fileoverview Exports a conversation to Markdown, plain text, or DOCX format.
 * The user picks the format via the native save dialog's file-type dropdown.
 * All formatting logic lives here so the renderer stays thin.
 */

import { dialog } from 'electron';
import { writeFile } from 'fs/promises';
import { extname } from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { getConversation, getMessages } from './store';
import type { Conversation, ChatMessage, ContentBlock } from '../shared/types';

/** Result returned to the renderer after an export attempt. */
interface ExportResult {
  success: boolean;
  error?: string;
}

/**
 * Exports a conversation to the user-chosen file format. Opens a native save
 * dialog with .md / .txt / .docx filters and writes the formatted output.
 */
export async function exportConversation(conversationId: string): Promise<ExportResult> {
  const conversation = getConversation(conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  const messages = getMessages(conversationId);

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Conversation',
    defaultPath: sanitizeFilename(conversation.title),
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Plain Text', extensions: ['txt'] },
      { name: 'Word Document', extensions: ['docx'] },
    ],
  });

  if (canceled || !filePath) {
    return { success: true };
  }

  try {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.docx') {
      const buffer = await formatAsDocx(conversation, messages);
      await writeFile(filePath, buffer);
    } else if (ext === '.txt') {
      const text = formatAsPlainText(conversation, messages);
      await writeFile(filePath, text, 'utf-8');
    } else {
      // Default to Markdown (.md or any other extension)
      const md = formatAsMarkdown(conversation, messages);
      await writeFile(filePath, md, 'utf-8');
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Markdown formatter
// ---------------------------------------------------------------------------

/** Formats a conversation as a Markdown document. */
function formatAsMarkdown(conversation: Conversation, messages: ChatMessage[]): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`*Exported: ${formatTimestamp(Date.now())}*`);
  lines.push('');

  for (const msg of messages) {
    lines.push('---');
    lines.push('');
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    lines.push(`**${role}** — *${formatTimestamp(msg.timestamp)}*`);
    lines.push('');
    lines.push(renderContentBlocks(msg.content, 'markdown'));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Plain text formatter
// ---------------------------------------------------------------------------

/** Formats a conversation as a plain text document. */
function formatAsPlainText(conversation: Conversation, messages: ChatMessage[]): string {
  const lines: string[] = [];
  lines.push(conversation.title);
  lines.push('='.repeat(conversation.title.length));
  lines.push(`Exported: ${formatTimestamp(Date.now())}`);
  lines.push('');

  for (const msg of messages) {
    lines.push('---');
    lines.push('');
    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    lines.push(`[${role}] ${formatTimestamp(msg.timestamp)}`);
    lines.push('');
    lines.push(renderContentBlocks(msg.content, 'text'));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DOCX formatter
// ---------------------------------------------------------------------------

/** Formats a conversation as a Word document and returns the buffer. */
async function formatAsDocx(conversation: Conversation, messages: ChatMessage[]): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: conversation.title,
      heading: HeadingLevel.HEADING_1,
    }),
  );

  // Export timestamp
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported: ${formatTimestamp(Date.now())}`,
          italics: true,
          size: 20,
          color: '666666',
        }),
      ],
    }),
  );

  children.push(new Paragraph({ text: '' }));

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';

    // Role heading
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: role, bold: true, size: 24 }),
          new TextRun({
            text: `  —  ${formatTimestamp(msg.timestamp)}`,
            italics: true,
            size: 20,
            color: '888888',
          }),
        ],
        heading: HeadingLevel.HEADING_2,
      }),
    );

    // Content blocks
    for (const block of msg.content) {
      children.push(...contentBlockToDocxParagraphs(block));
    }

    // Spacer
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/** Converts a single content block into one or more DOCX paragraphs. */
function contentBlockToDocxParagraphs(block: ContentBlock): Paragraph[] {
  switch (block.type) {
    case 'text':
      return block.text.split('\n').map(
        (line) => new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }),
      );

    case 'image':
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: `[Image: ${block.name ?? 'image.' + block.format}]`,
              italics: true,
              color: '888888',
            }),
          ],
        }),
      ];

    case 'document':
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: `[Document: ${block.name}]`,
              italics: true,
              color: '888888',
            }),
          ],
        }),
      ];

    case 'toolUse':
      return [
        new Paragraph({
          children: [
            new TextRun({ text: `Tool: ${block.name}`, bold: true, font: 'Courier New', size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: JSON.stringify(block.input, null, 2),
              font: 'Courier New',
              size: 18,
            }),
          ],
        }),
      ];

    case 'toolResult':
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: `Tool Result (${block.status}):`,
              bold: true,
              font: 'Courier New',
              size: 20,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: block.content, font: 'Courier New', size: 18 }),
          ],
        }),
      ];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Renders all content blocks in a message as a single string for text-based formats. */
function renderContentBlocks(blocks: ContentBlock[], format: 'markdown' | 'text'): string {
  return blocks.map((block) => renderContentBlock(block, format)).join('\n\n');
}

/** Renders a single content block as a string for text-based formats. */
function renderContentBlock(block: ContentBlock, format: 'markdown' | 'text'): string {
  switch (block.type) {
    case 'text':
      return block.text;

    case 'image':
      return `[Image: ${block.name ?? 'image.' + block.format}]`;

    case 'document':
      return `[Document: ${block.name}]`;

    case 'toolUse': {
      const json = JSON.stringify(block.input, null, 2);
      if (format === 'markdown') {
        return `**Tool: ${block.name}**\n\n\`\`\`json\n${json}\n\`\`\``;
      }
      return `Tool: ${block.name}\n${json}`;
    }

    case 'toolResult': {
      if (format === 'markdown') {
        return `**Tool Result** (${block.status}):\n\n\`\`\`\n${block.content}\n\`\`\``;
      }
      return `Tool Result (${block.status}):\n${block.content}`;
    }

    default:
      return '';
  }
}

/** Formats a Unix-ms timestamp as a human-readable date and time string. */
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Strips characters that are invalid in file names. */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
}
