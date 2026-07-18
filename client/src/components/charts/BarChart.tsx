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

/** Redesigned vertical bar chart (SVG) following Sentinels Enterprise rules. */
export function BarChart({
  data,
  height = 220,
  valueFormat = (v) => formatCurrency(v),
}: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barCount = data.length || 1;
  const gap = 12;
  const labelH = 24;
  const chartH = height - labelH;

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${barCount * 40} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
      >
        {data.map((d, i) => {
          const barH = (d.value / max) * (chartH - 20); // offset slightly for top labels
          const x = i * 40 + gap / 2;
          const w = 40 - gap;
          const y = chartH - barH;
          const isMax = d.value === max && d.value > 0;
          
          // Redesign Spec: 10% accent opacity for standard, bloom/glow for peaks
          const barColor = isMax ? 'rgba(0, 194, 255, 0.45)' : 'rgba(0, 194, 255, 0.15)';
          const hoverColor = isMax ? 'rgba(0, 194, 255, 0.65)' : 'rgba(0, 194, 255, 0.35)';

          return (
            <g key={i} className="group cursor-pointer">
              {/* Invisible trigger bar for hover area */}
              <rect
                x={x - gap/2}
                y={0}
                width={40}
                height={chartH}
                fill="transparent"
              />
              
              {/* Actual bar */}
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx={4}
                fill={barColor}
                style={{ 
                  transition: 'all 0.2s ease',
                  filter: isMax ? 'drop-shadow(0 0 4px rgba(0, 194, 255, 0.3))' : 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.setAttribute('fill', hoverColor);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.setAttribute('fill', barColor);
                }}
              />
              
              {d.value > 0 && (
                <text
                  x={x + w / 2}
                  y={y - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={isMax ? 'bold' : 'normal'}
                  fill={isMax ? 'var(--accent-cyan)' : 'var(--text-secondary)'}
                >
                  {valueFormat(d.value)}
                </text>
              )}
              
              <text
                x={x + w / 2}
                y={chartH + 16}
                textAnchor="middle"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
                fill="var(--text-muted)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
