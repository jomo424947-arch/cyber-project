import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface LayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Layout({ title, subtitle, actions, children }: LayoutProps) {
  const isMobile = useIsMobile();
  const { user, isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleLogout = async () => {
    setShowMoreMenu(false);
    await logout();
    toast('Signed out', 'info');
    navigate('/login');
  };

  const mobileMainItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/devices', label: 'Device Fleet', icon: 'devices' },
    { to: '/sessions', label: 'Active', icon: 'p2p' },
    { to: '/reservations', label: 'Bookings', icon: 'event_upcoming' },
  ];

  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Sidebar for Desktop */}
      {!isMobile && <Sidebar />}

      {/* Top AppBar for Desktop */}
      {!isMobile && (
        <header
          style={{
            height: '64px',
            position: 'fixed',
            top: 0,
            right: 0,
            width: 'calc(100% - var(--sidebar-width))',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(16px)',
            background: 'rgba(19, 19, 19, 0.8)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Left panel: connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span 
                style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: 'var(--accent-green)', 
                  display: 'inline-block',
                  boxShadow: '0 0 8px var(--accent-green)'
                }} 
              />
              <span 
                style={{ 
                  color: 'var(--accent-cyan)', 
                  fontWeight: 700, 
                  fontFamily: 'JetBrains Mono, monospace', 
                  fontSize: '10px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.15em' 
                }}
              >
                Network: Latency 24ms
              </span>
            </div>
            <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                verified_user
              </span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                Encrypted Session
              </span>
            </div>
          </div>

          {/* Right panel: User controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => toast('No new notifications.', 'info')} 
                style={{ color: 'var(--text-secondary)', padding: '8px', display: 'flex', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#00C2FF'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
              </button>
              <button 
                onClick={() => navigate('/settings')} 
                style={{ color: 'var(--text-secondary)', padding: '8px', display: 'flex', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#00C2FF'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>settings</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ textAlign: 'right' }}>
                <p 
                  style={{ 
                    fontFamily: 'JetBrains Mono, monospace', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#FFFFFF', 
                    lineHeight: '1.1', 
                    margin: 0,
                    textTransform: 'uppercase'
                  }}
                >
                  {user?.full_name ? user.full_name.replace(' ', '_') : 'Admin_X01'}
                </p>
                <p 
                  style={{ 
                    fontSize: '10px', 
                    color: 'var(--accent-cyan)', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em', 
                    margin: 0,
                    fontWeight: 600
                  }}
                >
                  {isAdmin ? 'System Secured' : 'Operator Secured'}
                </p>
              </div>
              <div 
                style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '8px', 
                  background: '#2a2a2a', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  overflow: 'hidden' 
                }}
              >
                <img 
                  style={{ width: '100%', height: '100%', objectCover: 'cover' }} 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBp_v8qgfulFoXebIOzh8QHF_DH_5pn0eOQ9Z18VGEJma03jbwJfgTgYrOZEChowlZ4G1NwaEXsuxtYP_3jVbXXpRIdFYg1x3S-QRGgb7D-73pj7UjAzS98WC6EAh172ghsEmvNO-uBtlDpQlBWU2BX0Fbg8yoDlMm1gRNR4FGiSWvWScjzLkM4cmUQvUjVrZ44EVOjB6V9BoDxROqVcmy966a-LKEFin1irVpEOt_G2YF7XB0tEh4a0oKsibNYApqcPkJu0x9SsMo"
                  alt="Avatar"
                />
              </div>
            </div>
          </div>
        </header>
      )}
      
      <main
        style={{
          marginLeft: isMobile ? 0 : 'var(--sidebar-width)',
          padding: isMobile ? '16px' : '32px',
          paddingTop: isMobile ? 'calc(16px + var(--safe-top))' : '96px', // offset fixed top app bar (64px + 32px padding)
          paddingBottom: isMobile ? 'calc(80px + var(--safe-bottom))' : '32px',
          minHeight: '100vh',
          flex: 1,
        }}
      >
        {/* Page header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '40px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="ccms-page-title">{title}</h1>
            {subtitle && (
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '16px', fontFamily: 'Inter, sans-serif', opacity: 0.8 }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>{actions}</div>}
        </header>

        {/* Page body */}
        <div>{children}</div>
      </main>

      {/* Mobile Adaptive Bottom Navigation */}
      {isMobile && (
        <>
          <nav
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: 'calc(60px + var(--safe-bottom))',
              paddingBottom: 'var(--safe-bottom)',
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              zIndex: 999,
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {mobileMainItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  flex: 1,
                  height: '100%',
                  minHeight: '44px',
                  transition: 'color 0.2s ease',
                  textShadow: isActive ? '0 0 10px rgba(0, 212, 255, 0.2)' : 'none',
                })}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '8px' }}>{item.label}</span>
              </NavLink>
            ))}
            
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                color: showMoreMenu ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '10px',
                fontWeight: 600,
                flex: 1,
                height: '100%',
                minHeight: '44px',
                transition: 'color 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '8px' }}>More</span>
            </button>
          </nav>

          {/* More Items Drawer */}
          {showMoreMenu && (
            <>
              <div
                onClick={() => setShowMoreMenu(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(5, 8, 16, 0.7)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 1000,
                  animation: 'fade-in 0.2s ease',
                }}
              />
              <div
                style={{
                  position: 'fixed',
                  bottom: 'calc(60px + var(--safe-bottom))',
                  left: 0,
                  right: 0,
                  background: 'var(--bg-surface)',
                  borderTop: '1px solid var(--border-default)',
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  padding: '20px',
                  zIndex: 1001,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  boxShadow: 'var(--shadow-glow-strong)',
                  animation: 'slide-up 0.25s ease-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid var(--border-default)', marginBottom: '8px' }}>
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
                    }}
                  >
                    {(user?.full_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{user?.full_name ?? 'User'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{user?.role ?? 'staff'}</div>
                  </div>
                </div>

                <NavLink
                  to="/billing"
                  onClick={() => setShowMoreMenu(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                    background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    minHeight: '44px',
                  })}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span> Financials
                </NavLink>

                <NavLink
                  to="/reports"
                  onClick={() => setShowMoreMenu(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                    background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    minHeight: '44px',
                  })}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>query_stats</span> Intelligence Reports
                </NavLink>

                {isAdmin && (
                  <NavLink
                    to="/settings"
                    onClick={() => setShowMoreMenu(false)}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                      background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 500,
                      minHeight: '44px',
                    })}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>security</span> Security Settings
                  </NavLink>
                )}

                <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '8px 0' }} />

                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'var(--accent-red)',
                    fontSize: '14px',
                    fontWeight: 600,
                    textAlign: 'left',
                    minHeight: '44px',
                    background: 'rgba(255, 68, 102, 0.05)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span> Sign Out
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
