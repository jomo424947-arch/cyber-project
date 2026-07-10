import { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  accent: string; // CSS color for the icon circle
  hint?: string;
  index?: number; // for staggered animation delay
}

/** Dashboard stat card: icon circle, big Audiowide value, Inter label. */
export function StatCard({ icon, label, value, accent, hint, index = 0 }: StatCardProps) {
  return (
    <div
      className="ccms-card ccms-card-hover"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${accent}1a`, // 10% opacity
            color: accent,
            fontSize: '20px',
            boxShadow: `0 0 12px ${accent}33`,
          }}
        >
          {icon}
        </div>
        <span className="ccms-eyebrow">{label}</span>
      </div>
      <div
        style={{
          fontFamily: 'Audiowide, sans-serif',
          fontSize: '2rem',
          lineHeight: 1,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      {hint && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{hint}</span>}
    </div>
  );
}
