import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** App shell: fixed sidebar + main content area (2rem padding, bg-base). */
export function Layout({ title, subtitle, actions, children }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 'var(--sidebar-width)',
          padding: '32px',
          minHeight: '100vh',
        }}
      >
        {/* Page header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '32px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="ccms-page-title">{title}</h1>
            {subtitle && (
              <p style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '14px' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>{actions}</div>}
        </header>

        {/* Page body */}
        <div>{children}</div>
      </main>
    </div>
  );
}
