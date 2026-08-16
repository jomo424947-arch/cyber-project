import { useState } from 'react';

interface HeatStripProps {
  counts: number[]; // length 24, one per hour
}

/** 24-hour activity heat strip — color intensity scales with session count. */
export function HeatStrip({ counts }: HeatStripProps) {
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const max = Math.max(1, ...counts);

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: '4px',
        }}
      >
        {counts.map((c, h) => {
          const intensity = c / max;
          const isHovered = activeHour === h;
          return (
            <div
              key={h}
              onMouseEnter={() => setActiveHour(h)}
              onMouseLeave={() => setActiveHour(null)}
              style={{
                height: '42px',
                borderRadius: '4px',
                background:
                  intensity === 0
                    ? 'rgba(255, 255, 255, 0.04)'
                    : `rgba(0, 194, 255, ${0.18 + intensity * 0.82})`,
                boxShadow: isHovered
                  ? '0 0 12px rgba(0, 194, 255, 0.6)'
                  : intensity > 0.6
                  ? `0 0 8px rgba(0, 194, 255, ${intensity * 0.4})`
                  : undefined,
                border: isHovered ? '1px solid #00C2FF' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isHovered ? 'scale(1.15)' : 'none',
                zIndex: isHovered ? 10 : 1,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: '4px',
          marginTop: '8px',
        }}
      >
        {counts.map((_, h) => (
          <div
            key={h}
            style={{
              textAlign: 'center',
              fontSize: 'calc(10px * var(--font-scale, 1))',
              fontFamily: 'JetBrains Mono, monospace',
              color: activeHour === h ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontWeight: activeHour === h ? 700 : 400,
            }}
          >
            {h % 3 === 0 ? `${h}` : ''}
          </div>
        ))}
      </div>

      {/* Floating Tooltip */}
      {activeHour !== null && (
        <div
          style={{
            position: 'absolute',
            top: '-36px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent-cyan)',
            padding: '4px 12px',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-glow-strong)',
            fontSize: 'calc(11px * var(--font-scale, 1))',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 30,
            whiteSpace: 'nowrap',
          }}
        >
          الساعة <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{activeHour}:00</span> — <strong style={{ color: 'var(--accent-green)' }}>{counts[activeHour]} جلسة نشطة</strong>
        </div>
      )}
    </div>
  );
}
