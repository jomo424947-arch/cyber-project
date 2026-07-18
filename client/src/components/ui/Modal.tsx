import { ReactNode, useEffect } from 'react';
import { Button } from './Button';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, footer, width = 480 }: ModalProps) {
  const isMobile = useIsMobile();

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
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 0 : '24px',
        animation: 'fade-in 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : `${width}px`,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderTop: '1px solid rgba(0, 194, 255, 0.3)', // Redesign specification inner glow
          borderBottom: isMobile ? 'none' : '1px solid var(--border-default)',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
          borderBottomLeftRadius: isMobile ? 0 : '12px',
          borderBottomRightRadius: isMobile ? 0 : '12px',
          boxShadow: 'var(--shadow-glow-strong)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: isMobile ? 'calc(100vh - 40px + var(--safe-top))' : 'none',
          animation: isMobile ? 'slide-up 0.25s ease-out both' : 'fade-in-up 0.25s ease-out both',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close" style={{ padding: '6px 10px', minHeight: '36px' }}>
            ✕
          </Button>
        </div>

        <div 
          style={{ 
            padding: '24px', 
            overflowY: 'auto', 
            flex: 1,
            paddingBottom: footer ? '24px' : 'calc(24px + var(--safe-bottom))'
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              paddingBottom: isMobile ? 'calc(16px + var(--safe-bottom))' : '16px',
              borderTop: '1px solid var(--border-default)',
              background: 'var(--bg-elevated)',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
