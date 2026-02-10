import React, { useMemo } from 'react';
import type { ImageBlock, UploadedFile } from '../../shared/types';

interface FileProps {
  file: UploadedFile;
  onRemove?: () => void;
}

interface BlockProps {
  block: ImageBlock;
}

type Props = FileProps | BlockProps;

function isFileProps(props: Props): props is FileProps {
  return 'file' in props;
}

export default function FilePreview(props: Props) {
  if (isFileProps(props)) {
    return <FilePreviewFromFile file={props.file} onRemove={props.onRemove} />;
  }
  return <ImagePreviewFromBlock block={props.block} />;
}

function FilePreviewFromFile({ file, onRemove }: FileProps) {
  const preview = useMemo(() => {
    if (file.type === 'image') {
      const blob = new Blob([new Uint8Array(file.bytes)], { type: `image/${file.format}` });
      return URL.createObjectURL(blob);
    }
    return null;
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
  const src = useMemo(() => {
    const blob = new Blob([new Uint8Array(block.bytes)], { type: `image/${block.format}` });
    return URL.createObjectURL(blob);
  }, [block]);

  return (
    <img
      src={src}
      alt={block.name ?? 'Image'}
      className="max-w-sm rounded-lg my-1"
    />
  );
}
