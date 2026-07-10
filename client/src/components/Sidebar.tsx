import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { to: '/devices', label: 'Devices', icon: '🖥' },
  { to: '/sessions', label: 'Sessions', icon: '⏱' },
  { to: '/billing', label: 'Billing', icon: '💳' },
  { to: '/reservations', label: 'Reservations', icon: '📅' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙', adminOnly: true },
];

export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
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
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '24px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <span
          style={{
            fontFamily: 'Audiowide, sans-serif',
            fontSize: '1.5rem',
            color: 'var(--accent-cyan)',
            textShadow: '0 0 12px rgba(0,212,255,0.4)',
          }}
        >
          CCMS
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
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
              gap: '12px',
              padding: '12px 20px',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
              borderLeft: isActive
                ? '3px solid var(--accent-cyan)'
                : '3px solid transparent',
              background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
              transition: 'all 0.2s ease',
              fontSize: '14px',
              fontWeight: 500,
            })}
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--accent-cyan-dim)',
            color: 'var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          {(user?.full_name ?? '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user?.full_name ?? 'User'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
            {user?.role ?? 'staff'}
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Logout"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '16px',
            padding: '6px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent-red)';
            e.currentTarget.style.background = 'rgba(255,68,102,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          ⏻
        </button>
      </div>
    </aside>
  );
}
