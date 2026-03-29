import type { PendingImage } from './useImageAttachments';

interface ImagePreviewStripProps {
  images: PendingImage[];
  onRemove: (id: string) => void;
}

export function ImagePreviewStrip({ images, onRemove }: ImagePreviewStripProps) {
  if (images.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      padding: '6px 8px',
      borderBottom: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)',
      flexWrap: 'wrap',
    }}>
      {images.map((img) => (
        <div
          key={img.id}
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--border-secondary)',
            flexShrink: 0,
          }}
        >
          <img
            src={img.preview}
            alt={img.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <button
            onClick={() => onRemove(img.id)}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)',
              border: 'none',
              color: '#fff',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
            }}
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <div style={{
        fontSize: 10,
        color: 'var(--text-tertiary)',
        alignSelf: 'center',
        marginLeft: 4,
      }}>
        {images.length}/5
      </div>
    </div>
  );
}
