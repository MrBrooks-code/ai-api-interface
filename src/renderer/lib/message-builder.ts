import type { ContentBlock, UploadedFile } from '../../shared/types';

export function buildTextBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

export function buildImageBlock(file: UploadedFile): ContentBlock {
  return {
    type: 'image',
    format: file.format as 'png' | 'jpeg' | 'gif' | 'webp',
    name: file.name,
    bytes: file.bytes,
  };
}

export function buildDocumentBlock(file: UploadedFile): ContentBlock {
  return {
    type: 'document',
    format: file.format as 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md',
    name: file.name,
    bytes: file.bytes,
  };
}

export function buildToolResultBlock(
  toolUseId: string,
  content: string,
  status: 'success' | 'error' = 'success'
): ContentBlock {
  return { type: 'toolResult', toolUseId, content, status };
}

export function fileToContentBlock(file: UploadedFile): ContentBlock {
  if (file.type === 'image') {
    return buildImageBlock(file);
  }
  return buildDocumentBlock(file);
}

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
