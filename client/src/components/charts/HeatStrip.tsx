interface HeatStripProps {
  counts: number[]; // length 24, one per hour
}

/** 24-hour activity heat strip — color intensity scales with session count. */
export function HeatStrip({ counts }: HeatStripProps) {
  const max = Math.max(1, ...counts);
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: '3px',
        }}
      >
        {counts.map((c, h) => {
          const intensity = c / max;
          return (
            <div
              key={h}
              title={`${h}:00 — ${c} session${c === 1 ? '' : 's'}`}
              style={{
                height: '40px',
                borderRadius: '4px',
                background:
                  intensity === 0
                    ? 'var(--bg-input)'
                    : `rgba(0, 212, 255, ${0.15 + intensity * 0.85})`,
                boxShadow: intensity > 0.6 ? `0 0 10px rgba(0,212,255,${intensity * 0.4})` : undefined,
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: '3px',
          marginTop: '6px',
        }}
      >
        {counts.map((_, h) => (
          <div
            key={h}
            style={{
              textAlign: 'center',
              fontSize: '9px',
              color: 'var(--text-secondary)',
            }}
          >
            {h % 3 === 0 ? `${h}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
