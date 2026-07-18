import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/devices', label: 'Device Fleet', icon: 'devices' },
  { to: '/sessions', label: 'Active Sessions', icon: 'p2p' },
  { to: '/billing', label: 'Financials', icon: 'payments' },
  { to: '/reservations', label: 'Reservations', icon: 'event_upcoming' },
  { to: '/reports', label: 'Intelligence Reports', icon: 'query_stats' },
  { to: '/settings', label: 'Security Settings', icon: 'security', adminOnly: true },
];

export function Sidebar() {
  const { isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (isMobile) return null;

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    await logout();
    toast('Signed out', 'info');
    navigate('/login');
  };

  return (
    <aside
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 'var(--sidebar-width)',
        background: '#0A0A0A',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
      }}
    >
      {/* Logo Section */}
      <div
        style={{
          padding: '40px 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '32px',
            fontWeight: 700,
            color: '#00C2FF',
            letterSpacing: '-0.02em',
            lineHeight: '1.2',
          }}
        >
          CCMS
        </span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            fontWeight: 600,
            color: '#A1A1AA',
            textTransform: 'uppercase',
            opacity: 0.5,
            letterSpacing: '0.1em',
            marginTop: '4px',
          }}
        >
          Admin Terminal
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0', overflowY: 'auto' }}>
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? 'ccms-nav-active' : ''
            }
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 32px',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderLeft: isActive
                ? '2px solid var(--accent-cyan)'
                : '2px solid transparent',
              background: isActive ? 'linear-gradient(to right, rgba(0, 194, 255, 0.1), transparent)' : 'transparent',
              transition: 'all 0.15s ease',
              textDecoration: 'none',
            })}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {item.icon}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {item.label}
            </span>
          </NavLink>
        ))}

        {/* Footer Support/Logout inside Nav flex container */}
        <div style={{ marginTop: 'auto', paddingBottom: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '24px' }}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); toast('Support ticket creation is available in Settings.', 'info'); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 32px',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              help
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Support
            </span>
          </a>

          <a
            href="#"
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 32px',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              logout
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Logout
            </span>
          </a>
        </div>
      </nav>
    </aside>
  );
}
