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
        gap: '12px',
        padding: '64px 24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}
    >
      {icon && (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-cyan-dim)',
            color: 'var(--accent-cyan)',
            fontSize: '26px',
          }}
        >
          {icon}
        </div>
      )}
      <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600 }}>
        {title}
      </h3>
      {description && <p style={{ maxWidth: '360px', fontSize: '14px' }}>{description}</p>}
      {action}
    </div>
  );
}
