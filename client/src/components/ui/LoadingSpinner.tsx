interface LoadingSpinnerProps {
  size?: number;
  label?: string;
}

export function LoadingSpinner({ size = 32, label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '48px',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          border: '3px solid var(--border-default)',
          borderTopColor: 'var(--accent-cyan)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      {label && <span style={{ fontSize: '13px' }}>{label}</span>}
    </div>
  );
}
