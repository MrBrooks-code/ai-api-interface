import React, { useState, useRef, useCallback } from 'react';
import FilePreview from './FilePreview';
import { ipc } from '../lib/ipc-client';
import type { UploadedFile } from '../../shared/types';

interface Props {
  onSend: (text: string, files?: UploadedFile[]) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export default function InputBar({ onSend, onAbort, isStreaming, disabled }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (isStreaming) {
      onAbort();
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    onSend(trimmed, files.length > 0 ? files : undefined);
    setText('');
    setFiles([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, files, isStreaming, onSend, onAbort]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const handleAttach = useCallback(async () => {
    const paths = await ipc.openFileDialog();
    if (paths.length === 0) return;

    const newFiles: UploadedFile[] = [];
    for (const path of paths) {
      try {
        const file = await ipc.readFile(path);
        newFiles.push(file);
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="border-t border-surface-lighter p-4">
      <div className="max-w-3xl mx-auto">
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((file, i) => (
              <FilePreview key={i} file={file} onRemove={() => removeFile(i)} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-surface-light rounded-xl px-3 py-2">
          {/* Attach button */}
          <button
            onClick={handleAttach}
            disabled={disabled}
            className="p-1.5 text-text-muted hover:text-text transition-colors disabled:opacity-30"
            title="Attach file&#10;&#10;Supported types:&#10;Images: PNG, JPG, GIF, WEBP&#10;Documents: PDF, CSV, TXT, MD, HTML, DOC, DOCX, XLS, XLSX"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'Connect to AWS to start chatting...' : 'Type a message...'}
            className="flex-1 bg-transparent resize-none outline-none text-text placeholder-text-dim text-sm leading-relaxed max-h-[200px] py-1.5"
            rows={1}
          />

          {/* Send / Stop button */}
          <button
            onClick={handleSubmit}
            disabled={disabled && !isStreaming}
            className={`p-1.5 rounded-lg transition-colors ${
              isStreaming
                ? 'text-accent-red hover:bg-accent-red/10'
                : 'text-primary hover:bg-primary/10 disabled:opacity-30'
            }`}
            title={isStreaming ? 'Stop' : 'Send'}
          >
            {isStreaming ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        <p className="text-text-dim text-xs mt-1.5 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
