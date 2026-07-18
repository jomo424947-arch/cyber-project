import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '64px 24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        maxWidth: '420px',
        margin: '0 auto',
      }}
    >
      {icon && (
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--accent-cyan)',
            fontSize: '28px',
            boxShadow: 'var(--shadow-glow)',
            marginBottom: '4px',
          }}
        >
          {icon}
        </div>
      )}
      <h3 style={{ color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, margin: 0 }}>
        {title}
      </h3>
      {description && <p style={{ fontSize: '14px', fontFamily: 'Inter, sans-serif', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{description}</p>}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}
