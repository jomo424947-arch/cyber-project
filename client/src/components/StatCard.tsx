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
  if (typeof icon !== 'string') return 'analytics';
  switch (icon) {
    case '✓':
    case 'check':
      return 'check_circle';
    case '!':
    case 'warning':
      return 'warning';
    case '🗂':
    case 'invoices':
      return 'receipt_long';
    case '⏱':
    case 'timer':
      return 'history_toggle_off';
    case '🖥':
    case 'pc':
      return 'devices';
    case '$':
    case 'usd':
      return 'payments';
    case '📅':
    case 'calendar':
      return 'event_upcoming';
    case '🕹':
    case 'gamepad':
      return 'sports_esports';
    case '💳':
    case 'card':
      return 'credit_card';
    default:
      return 'analytics';
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
        borderTop: `1px solid ${accent}`, // Redesign spec Level 2 Inner Glow
      }}
    >
      {/* Background Decorative Icon */}
      <div
        className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity"
        style={{ color: accent }}
      >
        <span className="material-symbols-outlined text-[72px] leading-none">
          {iconName}
        </span>
      </div>

      {/* Top Header Label */}
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: accent }}>
          {iconName}
        </span>
        <span className="font-label-caps text-label-caps text-text-secondary leading-none">
          {label}
        </span>
      </div>

      {/* Numerical Value and Hint */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '36px',
            fontWeight: 700,
            lineHeight: 1.1,
            color: 'var(--text-primary)',
          }}
        >
          {value}
        </div>
        {displayHint && (
          <span 
            style={{ 
              fontSize: '12px', 
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
