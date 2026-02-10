/**
 * @fileoverview File dialog and validated file reading. Only paths explicitly
 * selected by the user through the native dialog are readable — this prevents
 * a compromised renderer from requesting arbitrary file access (AC-F03).
 */

import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import type { UploadedFile } from '../shared/types';

/** Tracks file paths the user has explicitly selected via the open dialog. */
const allowedPaths = new Set<string>();

/** Map of image file extensions to Bedrock-compatible format identifiers. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
};

/** Map of document file extensions to Bedrock-compatible format identifiers. */
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  '.pdf': 'pdf',
  '.csv': 'csv',
  '.doc': 'doc',
  '.docx': 'docx',
  '.xls': 'xls',
  '.xlsx': 'xlsx',
  '.html': 'html',
  '.txt': 'txt',
  '.md': 'md',
};

/**
 * Opens the native file picker and registers selected paths as allowed.
 * @returns Array of selected file paths, or empty if the dialog was cancelled.
 */
export async function openFileDialog(): Promise<string[]> {
  const allExtensions = [
    ...Object.keys(IMAGE_EXTENSIONS),
    ...Object.keys(DOCUMENT_EXTENSIONS),
  ].map((ext) => ext.slice(1)); // remove leading dot

  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported Files', extensions: allExtensions },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'Documents', extensions: ['pdf', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'html', 'txt', 'md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) return [];
  for (const fp of result.filePaths) {
    allowedPaths.add(fp);
  }
  return result.filePaths;
}

/** Maximum allowed file size (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Reads a file from disk after validating it was selected via the dialog.
 * @param filePath Absolute path previously returned by {@link openFileDialog}.
 * @throws If the path was not selected via the dialog or exceeds the size limit.
 */
export async function readFile(filePath: string): Promise<UploadedFile> {
  if (!allowedPaths.has(filePath)) {
    throw new Error('File access denied: path was not selected via the file dialog');
  }

  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum allowed size of 50 MB`);
  }

  const bytes = fs.readFileSync(filePath);

  let type: 'image' | 'document';
  let format: string;

  if (IMAGE_EXTENSIONS[ext]) {
    type = 'image';
    format = IMAGE_EXTENSIONS[ext];
  } else if (DOCUMENT_EXTENSIONS[ext]) {
    type = 'document';
    format = DOCUMENT_EXTENSIONS[ext];
  } else {
    // Default to txt for unknown types
    type = 'document';
    format = 'txt';
  }

  return {
    path: filePath,
    name,
    type,
    format,
    bytes: new Uint8Array(bytes),
    size: bytes.length,
  };
}
