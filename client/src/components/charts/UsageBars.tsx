import { formatDuration } from '../../utils/format';

interface UsageRow {
  label: string;
  minutes: number;
  utilization: number; // 0-100
  type?: string;
  icon?: string;
}

interface UsageBarsProps {
  rows: UsageRow[];
  color?: string;
}

/** Horizontal utilization bars for per-device usage. */
export function UsageBars({ rows, color = 'var(--accent-purple)' }: UsageBarsProps) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              {r.icon ? `${r.icon} ` : ''}
              {r.label}
              {r.type && (
                <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px' }}>
                  {r.type}
                </span>
              )}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {formatDuration(r.minutes)} · {r.utilization.toFixed(0)}%
            </span>
          </div>
          <div
            style={{
              height: '8px',
              borderRadius: '4px',
              background: 'var(--bg-input)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(r.minutes / max) * 100}%`,
                height: '100%',
                background: color,
                borderRadius: '4px',
                boxShadow: `0 0 8px ${color}66`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
