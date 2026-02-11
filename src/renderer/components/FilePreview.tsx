/**
 * @fileoverview Previews an uploaded file (thumbnail + name in the input bar)
 * or renders an inline image from a message's {@link ImageBlock}.
 */

import React, { useEffect, useState } from 'react';
import type { ImageBlock, UploadedFile } from '../../shared/types';

/** Props for previewing an attached file before sending. */
interface FileProps {
  file: UploadedFile;
  onRemove?: () => void;
}

/** Props for rendering an image already present in a message. */
interface BlockProps {
  block: ImageBlock;
}

/** Discriminated union — either an attached file or an in-message image block. */
type Props = FileProps | BlockProps;

/** Type guard distinguishing file-based props from block-based props. */
function isFileProps(props: Props): props is FileProps {
  return 'file' in props;
}

/** Renders a file attachment thumbnail or an inline image block. */
export default function FilePreview(props: Props) {
  if (isFileProps(props)) {
    return <FilePreviewFromFile file={props.file} onRemove={props.onRemove} />;
  }
  return <ImagePreviewFromBlock block={props.block} />;
}

function FilePreviewFromFile({ file, onRemove }: FileProps) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (file.type === 'image') {
      const blob = new Blob([new Uint8Array(file.bytes)], { type: `image/${file.format}` });
      const url = URL.createObjectURL(blob);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  return (
    <div className="relative group inline-flex items-center gap-2 bg-surface-lighter rounded-lg px-2 py-1.5">
      {preview ? (
        <img
          src={preview}
          alt={file.name}
          className="w-10 h-10 object-cover rounded"
        />
      ) : (
        <span className="text-primary text-lg">📄</span>
      )}
      <span className="text-text-muted text-xs max-w-[120px] truncate">{file.name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent-red text-surface rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ImagePreviewFromBlock({ block }: BlockProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const blob = new Blob([new Uint8Array(block.bytes)], { type: `image/${block.format}` });
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [block]);

  return (
    <img
      src={src}
      alt={block.name ?? 'Image'}
      className="max-w-sm rounded-lg my-1"
    />
  );
}
