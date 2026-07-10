import { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/** Hand-built table following the spec:
 *  - uppercase header row on --bg-elevated
 *  - no outer border, no zebra striping
 *  - row hover → --bg-elevated
 */

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
  if (data.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-elevated)' }}>
            {columns.map((col) => (
              <Th key={col.key} width={col.width} align={col.align}>
                {col.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-default)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
              }}
            >
              {columns.map((col) => (
                <Td key={col.key} align={col.align}>
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
        padding: '12px 16px',
        fontSize: '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 600,
        width,
        whiteSpace: 'nowrap',
        ...(align === 'right' ? { paddingRight: '16px' } : {}),
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
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '14px 16px',
        color: 'var(--text-primary)',
        fontSize: '14px',
        verticalAlign: 'middle',
      }}
      {...rest}
    >
      {children}
    </td>
  );
}
