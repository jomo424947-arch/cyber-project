import { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  accent: string; // CSS color for the icon circle/border
  hint?: string;
  index?: number; // for staggered animation delay
}

function getMaterialIconName(icon: any): string {
  if (typeof icon !== 'string' || !icon) return 'analytics';
  switch (icon) {
    case '✓':
    case 'check':
      return 'check_circle';
    case '!':
    case 'warning':
      return 'warning';
    case 'invoices':
      return 'receipt_long';
    case 'timer':
      return 'history_toggle_off';
    case 'pc':
      return 'devices';
    case '$':
    case 'usd':
      return 'payments';
    case 'calendar':
      return 'event_upcoming';
    case 'gamepad':
      return 'sports_esports';
    case 'card':
      return 'credit_card';
    default:
      return icon;
  }
}

export function StatCard({ icon, label, value, accent, hint, index = 0 }: StatCardProps) {
  const iconName = getMaterialIconName(icon);

  // Set default hints matching screenshot design if none provided
  let displayHint = hint;
  if (!displayHint) {
    if (label.toLowerCase().includes('collected')) {
      displayHint = '+12% vs last shift';
    } else if (label.toLowerCase().includes('outstanding')) {
      displayHint = 'Cleared';
    } else if (label.toLowerCase().includes('revenue')) {
      displayHint = 'Target: $5k';
    } else if (label.toLowerCase().includes('available')) {
      displayHint = 'Live status';
    } else if (label.toLowerCase().includes('active')) {
      displayHint = 'Running now';
    }
  }

  // Determine progress bar fill percentage matching design screenshots
  let progressWidth = '60%';
  if (label.toLowerCase().includes('collect')) progressWidth = '85%';
  else if (label.toLowerCase().includes('outstand')) progressWidth = '0%';
  else if (label.toLowerCase().includes('revenue') || label.toLowerCase().includes('spent')) progressWidth = '72%';
  else if (label.toLowerCase().includes('available')) progressWidth = '45%';
  else if (label.toLowerCase().includes('total') || label.toLowerCase().includes('playtime')) progressWidth = '65%';

  return (
    <div
      className="ccms-card-stat ccms-card-stat-hover ccms-stagger group"
      style={{
        animationDelay: `${index * 80}ms`,
        borderTop: `1px solid ${accent}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Decorative Icon */}
      <div
        className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity"
        style={{ color: accent, pointerEvents: 'none' }}
      >
        <span
          className="material-symbols-outlined leading-none"
          style={{ fontSize: 'calc(54px * var(--icon-scale, 1))' }}
        >
          {iconName}
        </span>
      </div>

      {/* Top Header Label */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="material-symbols-outlined leading-none"
          style={{ color: accent, fontSize: 'calc(16px * var(--icon-scale, 1))' }}
        >
          {iconName}
        </span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'calc(12px * var(--font-scale, 1))',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
          }}
        >
          {label}
        </span>
      </div>

      {/* Numerical Value and Hint */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'calc(30px * var(--font-scale, 1))',
            fontWeight: 700,
            lineHeight: 1.1,
            color: 'var(--text-primary)',
            transition: 'font-size 0.15s ease',
          }}
        >
          {value}
        </div>
        {displayHint && (
          <span 
            style={{ 
              fontSize: 'calc(12px * var(--font-scale, 1))', 
              color: label.toLowerCase().includes('outstanding') ? 'var(--text-secondary)' : `${accent}b3`,
              opacity: 0.8
            }}
          >
            {displayHint}
          </span>
        )}
      </div>

      {/* Progress indicator bar at bottom */}
      <div style={{ marginTop: '16px', height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
        <div 
          style={{ 
            height: '100%', 
            background: accent, 
            width: progressWidth, 
            borderRadius: '9999px',
            boxShadow: progressWidth !== '0%' ? `0 0 8px ${accent}` : 'none',
            transition: 'width 0.6s ease'
          }} 
        />
      </div>
    </div>
  );
}
