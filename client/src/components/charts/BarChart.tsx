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

/** Hand-built vertical bar chart (SVG). No charting library. */
export function BarChart({
  data,
  height = 220,
  color = 'var(--accent-cyan)',
  valueFormat = (v) => formatCurrency(v),
}: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barCount = data.length || 1;
  const gap = 8;
  const labelH = 24;
  const chartH = height - labelH;

  // Build viewBox with relative units; bars fill width evenly.
  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${barCount * 40} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
      >
        {data.map((d, i) => {
          const barH = (d.value / max) * chartH;
          const x = i * 40 + gap / 2;
          const w = 40 - gap;
          const y = chartH - barH;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx={4}
                fill={color}
                opacity={0.85}
                style={{ transition: 'opacity 0.2s ease' }}
              />
              {d.value > 0 && (
                <text
                  x={x + w / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-secondary)"
                >
                  {valueFormat(d.value)}
                </text>
              )}
              <text
                x={x + w / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-secondary)"
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
