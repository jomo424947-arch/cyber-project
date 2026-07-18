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

export function UsageBars({ rows, color = 'var(--accent-purple)' }: UsageBarsProps) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>
              {r.icon ? `${r.icon} ` : ''}
              {r.label}
              {r.type && (
                <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '11px', fontFamily: 'Inter, sans-serif' }}>
                  {r.type}
                </span>
              )}
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
              {formatDuration(r.minutes)} · {r.utilization.toFixed(0)}%
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.05)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(r.minutes / max) * 100}%`,
                height: '100%',
                background: color,
                borderRadius: '999px',
                boxShadow: `0 0 8px ${color}`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
