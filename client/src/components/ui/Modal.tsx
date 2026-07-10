import { ReactNode, useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, footer, width = 480 }: ModalProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 16, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
        animation: 'fade-in 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: `${width}px`,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-glow-strong)',
          overflow: 'hidden',
          animation: 'fade-in-up 0.25s ease-out both',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <h2
            style={{
              fontFamily: 'Audiowide, sans-serif',
              fontSize: '1.1rem',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close" style={{ padding: '6px 10px' }}>
            ✕
          </Button>
        </div>

        <div style={{ padding: '24px' }}>{children}</div>

        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-default)',
              background: 'var(--bg-elevated)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
