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
        padding: '4px 10px',
        borderRadius: '999px',
        background: bg,
        color,
        border: `1px solid ${color}4d`, // 30% opacity border
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {pulse && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            marginRight: '6px',
            boxShadow: `0 0 6px ${color}`,
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }}
        />
      )}
      {label}
    </span>
  );
}
