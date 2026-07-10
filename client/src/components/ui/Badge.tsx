import { ReactNode } from 'react';

interface BadgeProps {
  label: string;
  color: string; // CSS color for dot + text
  bg: string; // tinted background
  pulse?: boolean; // pulse the dot (for "In Use")
  children?: ReactNode;
}

/** Small pill with a colored dot + label — used for device & reservation statuses. */
export function Badge({ label, color, bg, pulse }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        background: bg,
        color,
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: pulse ? 'pulse-dot 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {label}
    </span>
  );
}
