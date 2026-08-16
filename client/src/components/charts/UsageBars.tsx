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
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: 'calc(13px * var(--font-scale, 1))', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {r.icon && (
                <span className="material-symbols-outlined" style={{ fontSize: 'calc(18px * var(--icon-scale, 1))', color: 'var(--accent-cyan)' }}>
                  {r.icon}
                </span>
              )}
              <span>{r.label}</span>
              {r.type && (
                <span style={{ color: 'var(--text-secondary)', fontSize: 'calc(11px * var(--font-scale, 1))', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-default)', fontWeight: 500 }}>
                  {r.type}
                </span>
              )}
            </span>
            <span style={{ fontSize: 'calc(12px * var(--font-scale, 1))', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {formatDuration(r.minutes)} · {r.utilization.toFixed(0)}%
            </span>
          </div>
          <div
            style={{
              height: '8px',
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
                boxShadow: `0 0 10px ${color}`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
