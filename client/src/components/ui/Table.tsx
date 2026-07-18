import { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  width?: string | number;
  align?: 'left' | 'right' | 'center';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}

export function Table<T>({ columns, data, rowKey, onRowClick, empty }: TableProps<T>) {
  const isMobile = useIsMobile();

  if (data.length === 0 && empty) {
    return <>{empty}</>;
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        {data.map((row, index) => {
          const headerCol = columns[0];
          const restCols = columns.slice(1);

          return (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="ccms-card"
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                cursor: onRowClick ? 'pointer' : 'default',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                transition: 'border-color 0.2s ease',
              }}
            >
              {headerCol && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-default)',
                    paddingBottom: '8px',
                    marginBottom: '4px',
                  }}
                >
                  <span className="ccms-eyebrow" style={{ fontSize: '10px' }}>
                    {headerCol.header}
                  </span>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      textAlign: headerCol.align ?? 'left',
                    }}
                  >
                    {headerCol.render(row, index)}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {restCols.map((col) => {
                  const val = col.render(row, index);
                  if (val === undefined || val === null) return null;

                  if (col.key === 'action' || col.key === 'actions') {
                    return (
                      <div
                        key={col.key}
                        style={{
                          borderTop: '1px solid var(--border-default)',
                          paddingTop: '12px',
                          marginTop: '8px',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          width: '100%',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        {val}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={col.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {col.header}
                      </span>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          textAlign: col.align ?? 'right',
                          maxWidth: '65%',
                        }}
                      >
                        {val}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#2a2a2a', borderBottom: '1px solid var(--border-default)' }}>
            {columns.map((col) => (
              <Th key={col.key} width={col.width} align={col.align}>
                {col.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody style={{ divideY: '1px solid rgba(255,255,255,0.05)' }}>
          {data.map((row, index) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="table-row-hover"
              style={{
                background: 'var(--bg-surface)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.transform = 'translateX(0px)';
              }}
            >
              {columns.map((col) => (
                <Td key={col.key} align={col.align} isIdColumn={col.key === 'device' || col.key === 'invoice' || col.key === 'id' || col.key.includes('id') || col.key === 'rank' || col.key === 'username'}>
                  {col.render(row, index)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  width,
  align = 'left',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; width?: string | number }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '16px 24px',
        fontSize: '10px',
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 600,
        width,
        whiteSpace: 'nowrap',
        ...(align === 'right' ? { paddingRight: '24px' } : {}),
      }}
      {...rest}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  isIdColumn = false,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; isIdColumn?: boolean }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '20px 24px',
        color: isIdColumn ? 'var(--accent-cyan)' : 'var(--text-primary)',
        fontFamily: isIdColumn ? 'JetBrains Mono, monospace' : 'inherit',
        fontSize: isIdColumn ? '14px' : '14px',
        fontWeight: isIdColumn ? 500 : 'normal',
        verticalAlign: 'middle',
      }}
      {...rest}
    >
      {children}
    </td>
  );
}
