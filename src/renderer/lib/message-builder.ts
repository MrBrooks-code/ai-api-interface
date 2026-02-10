/**
 * @fileoverview Factory functions for constructing {@link ContentBlock} arrays
 * from user input and uploaded files. Used by the chat hook to build the
 * message payload before sending to the main process.
 */

import type { ContentBlock, UploadedFile } from '../../shared/types';

/** Creates a plain text content block. */
export function buildTextBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

/** Creates an image content block from an uploaded file. */
export function buildImageBlock(file: UploadedFile): ContentBlock {
  return {
    type: 'image',
    format: file.format as 'png' | 'jpeg' | 'gif' | 'webp',
    name: file.name,
    bytes: file.bytes,
  };
}

/** Creates a document content block from an uploaded file. */
export function buildDocumentBlock(file: UploadedFile): ContentBlock {
  return {
    type: 'document',
    format: file.format as 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md',
    name: file.name,
    bytes: file.bytes,
  };
}

/** Creates a tool result block to feed back to the model after tool execution. */
export function buildToolResultBlock(
  toolUseId: string,
  content: string,
  status: 'success' | 'error' = 'success'
): ContentBlock {
  return { type: 'toolResult', toolUseId, content, status };
}

/** Routes an uploaded file to the appropriate image or document block builder. */
export function fileToContentBlock(file: UploadedFile): ContentBlock {
  if (file.type === 'image') {
    return buildImageBlock(file);
  }
  return buildDocumentBlock(file);
}

/**
 * Assembles a complete user message content array from text and optional files.
 * File blocks are placed before the text block so the model sees attachments first.
 */
export function buildUserContent(
  text: string,
  files: UploadedFile[] = []
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Add file blocks first
  for (const file of files) {
    blocks.push(fileToContentBlock(file));
  }

  // Add text block
  if (text.trim()) {
    blocks.push(buildTextBlock(text));
  }

  return blocks;
}
