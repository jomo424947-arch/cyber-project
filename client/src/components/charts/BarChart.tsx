import { useState } from 'react';
import { formatCurrency } from '../../utils/format';

interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  valueFormat?: (v: number) => string;
}

export function BarChart({
  data,
  height = 220,
  valueFormat = (v) => formatCurrency(v),
}: BarChartProps) {
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  // Helper for compact representation above bars so text never overlaps
  const formatCompact = (val: number) => {
    if (val <= 0) return '';
    if (val >= 10000) return `${(val / 1000).toFixed(0)}k`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return Math.round(val).toString();
  };

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {/* Chart container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '6px',
          height: `${height - 32}px`,
          paddingBottom: '8px',
          borderBottom: '1px solid var(--border-default)',
          position: 'relative',
        }}
      >
        {data.map((d, i) => {
          const fillRatio = d.value / max;
          const barHeightPercent = d.value > 0 ? Math.max(10, fillRatio * 85) : 3;
          const isMax = d.value === max && d.value > 0;
          const isHovered = activeBar === i;

          return (
            <div
              key={i}
              onMouseEnter={() => setActiveBar(i)}
              onMouseLeave={() => setActiveBar(null)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {/* Compact bar value above top */}
              {d.value > 0 && (
                <span
                  style={{
                    fontSize: 'calc(10px * var(--font-scale, 1))',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: isMax ? 700 : 500,
                    color: isMax ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCompact(d.value)}
                </span>
              )}

              {/* Bar element */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '28px',
                  height: `${barHeightPercent}%`,
                  borderRadius: '6px 6px 2px 2px',
                  background: isHovered
                    ? 'linear-gradient(to top, rgba(0, 194, 255, 0.5), #00C2FF)'
                    : isMax
                    ? 'linear-gradient(to top, rgba(0, 194, 255, 0.35), rgba(0, 194, 255, 0.85))'
                    : d.value > 0
                    ? 'linear-gradient(to top, rgba(0, 194, 255, 0.12), rgba(0, 194, 255, 0.35))'
                    : 'rgba(255, 255, 255, 0.04)',
                  borderTop: isMax || isHovered ? '1px solid #00C2FF' : 'none',
                  boxShadow: isMax || isHovered ? '0 0 12px rgba(0, 194, 255, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                  transform: isHovered ? 'scaleY(1.04)' : 'none',
                  transformOrigin: 'bottom',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '6px',
          marginTop: '8px',
        }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 'calc(10px * var(--font-scale, 1))',
              fontFamily: 'JetBrains Mono, monospace',
              color: activeBar === i ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontWeight: activeBar === i ? 700 : 400,
            }}
          >
            {d.label}
          </div>
        ))}
      </div>

      {/* Hover Floating Tooltip */}
      {activeBar !== null && data[activeBar] && (
        <div
          style={{
            position: 'absolute',
            top: '-36px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent-cyan)',
            padding: '6px 14px',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-glow-strong)',
            fontSize: 'calc(12px * var(--font-scale, 1))',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>يوم {data[activeBar].label}:</span>
          <strong style={{ color: 'var(--accent-cyan)' }}>{valueFormat(data[activeBar].value)}</strong>
        </div>
      )}
    </div>
  );
}
