import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { StartShiftModal, CloseShiftModal } from './ShiftModals';
import type { Shift } from '../types';

interface LayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  currentShift?: Shift | null;
}

export function Layout({ title, subtitle, actions, children, currentShift }: LayoutProps) {
  const isMobile = useIsMobile();
  const { user, isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const { language, setLanguage, t, isRtl } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const effectiveShift = currentShift !== undefined ? currentShift : activeShift;

  const refreshActiveShift = () => {
    dataService.getActiveShift()
      .then((s) => setActiveShift(s))
      .catch(() => setActiveShift(null));
  };

  useEffect(() => {
    let mounted = true;
    const fetchShift = () => {
      dataService.getActiveShift()
        .then((s) => {
          if (mounted) setActiveShift(s);
        })
        .catch(() => {});
    };

    fetchShift();
    window.addEventListener('shift-changed', fetchShift);
    window.addEventListener('focus', fetchShift);
    const interval = setInterval(fetchShift, 5000);

    return () => {
      mounted = false;
      window.removeEventListener('shift-changed', fetchShift);
      window.removeEventListener('focus', fetchShift);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    setShowMoreMenu(false);
    await logout();
    toast(t('success'), 'info');
    navigate('/login');
  };

  const mobileMainItems = [
    { to: '/dashboard', label: t('dashboard'), icon: 'dashboard' },
    { to: '/rooms', label: t('rooms'), icon: 'meeting_room' },
    { to: '/devices', label: t('devices'), icon: 'devices' },
    { to: '/sessions', label: t('sessions'), icon: 'p2p' },
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
            left: isRtl ? 0 : 'auto',
            right: isRtl ? 'auto' : 0,
            width: 'calc(100% - var(--sidebar-width))',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            borderBottom: '1px solid var(--border-default)',
            backdropFilter: 'blur(16px)',
            background: 'var(--header-bg)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Left panel: Active shift badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {effectiveShift ? (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: 'var(--accent-green)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title={language === 'ar' ? 'عرض تفاصيل الوردية النشطة' : 'View active shift details'}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                <span>{language === 'ar' ? 'الوردية نشطة' : 'Active Shift'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>•</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                  +{formatCurrency(Number(effectiveShift.total_revenue || 0))}
                </span>
              </button>
            ) : null}
          </div>

          {/* Right panel: User controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={toggleTheme}
                style={{ 
                  color: theme === 'dark' ? '#F59E0B' : 'var(--accent-cyan)', 
                  padding: '8px', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'var(--accent-cyan-dim)',
                  border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-glow)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title={t('toggle_theme')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              <button 
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                style={{ 
                  color: 'var(--accent-cyan)', 
                  padding: '6px 10px', 
                  display: 'flex', 
                  background: 'var(--accent-cyan-dim)',
                  border: '1px solid var(--border-glow)',
                  borderRadius: '6px',
                  fontWeight: 700, 
                  fontSize: '11px', 
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: isRtl ? 'Cairo, sans-serif' : 'Space Grotesk, sans-serif'
                }}
                title={language === 'en' ? 'Arabic' : 'English'}
              >
                {language === 'en' ? 'العربية' : 'English'}
              </button>

              <button 
                onClick={() => toast(t('no_notifications'), 'info')} 
                style={{ color: 'var(--text-secondary)', padding: '8px', display: 'flex', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>notifications</span>
              </button>
              <button 
                onClick={() => navigate('/settings')} 
                style={{ color: 'var(--text-secondary)', padding: '8px', display: 'flex', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>settings</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  textAlign: isRtl ? 'left' : 'right',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <p 
                  style={{ 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: 'var(--text-primary)', 
                    lineHeight: '1.2', 
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {user?.full_name ? user.full_name : 'Admin'}
                </p>
                <p 
                  style={{ 
                    fontSize: '10px', 
                    color: 'var(--accent-cyan)', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.08em', 
                    margin: 0,
                    fontWeight: 600,
                    marginTop: '2px',
                  }}
                >
                  {isAdmin ? t('system_secured') : t('operator_secured')}
                </p>
              </div>
            </div>
          </div>
        </header>
      )}
      
      <main
        style={{
          marginLeft: isRtl ? 0 : (isMobile ? 0 : 'var(--sidebar-width)'),
          marginRight: isRtl ? (isMobile ? 0 : 'var(--sidebar-width)') : 0,
          padding: isMobile ? '16px' : '32px',
          paddingTop: isMobile ? 'calc(16px + var(--safe-top))' : (title || subtitle ? '96px' : '74px'), // offset fixed top app bar
          paddingBottom: isMobile ? 'calc(80px + var(--safe-bottom))' : '32px',
          minHeight: '100vh',
          flex: 1,
        }}
      >
        {/* Page header */}
        {(title || subtitle || actions) && (
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: (title || subtitle) ? 'space-between' : 'flex-end',
              gap: '16px',
              marginBottom: (title || subtitle) ? '32px' : '16px',
              flexWrap: 'wrap',
            }}
          >
            {(title || subtitle) && (
              <div>
                {title && <h1 className="ccms-page-title">{title}</h1>}
                {subtitle && (
                  <p style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '15px', fontFamily: 'Inter, sans-serif', opacity: 0.8 }}>
                    {subtitle}
                  </p>
                )}
              </div>
            )}
            {actions && <div style={{ display: 'flex', gap: '16px', flexShrink: 0, marginLeft: isRtl ? 'auto' : 0, marginRight: isRtl ? 0 : 'auto' }}>{actions}</div>}
          </header>
        )}

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
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{item.icon}</span>
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
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>menu</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '8px' }}>{t('more')}</span>
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
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {user?.role === 'admin' ? t('administrator') : t('staff_operator')}
                    </div>
                  </div>
                </div>

                {/* Theme & Language Toggles for Mobile Drawer */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button 
                    onClick={toggleTheme}
                    style={{ 
                      flex: 1,
                      display: 'flex', 
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px', 
                      color: theme === 'dark' ? '#F59E0B' : 'var(--accent-cyan)', 
                      background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'var(--accent-cyan-dim)',
                      border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-glow)',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '13px',
                      minHeight: '44px',
                      cursor: 'pointer',
                    }}
                    title={t('toggle_theme')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </span>
                    <span>{theme === 'dark' ? t('light_mode') : t('dark_mode')}</span>
                  </button>

                  <button 
                    onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                    style={{ 
                      flex: 1,
                      display: 'flex', 
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px', 
                      color: 'var(--accent-cyan)', 
                      background: 'var(--accent-cyan-dim)',
                      border: '1px solid var(--border-glow)',
                      borderRadius: '8px',
                      fontWeight: 700, 
                      fontSize: '13px', 
                      minHeight: '44px',
                      cursor: 'pointer',
                      fontFamily: isRtl ? 'Cairo, sans-serif' : 'Space Grotesk, sans-serif'
                    }}
                    title={language === 'en' ? 'Arabic' : 'English'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>language</span>
                    <span>{language === 'en' ? 'العربية' : 'English'}</span>
                  </button>
                </div>

                <NavLink
                  to="/products"
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
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inventory_2</span> {t('products')}
                </NavLink>


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
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>payments</span> {t('billing')}
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
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>query_stats</span> {t('reports')}
                </NavLink>

                {isAdmin && (
                  <>
                    <NavLink
                      to="/employees"
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
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>badge</span> {t('employees')}
                    </NavLink>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>security</span> {t('settings')}
                    </NavLink>
                  </>
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
                    textAlign: isRtl ? 'right' : 'left',
                    minHeight: '44px',
                    background: 'rgba(255, 68, 102, 0.05)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span> {t('logout')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Global Quick Shift Modals */}
      <StartShiftModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
        onStarted={() => {
          setShowStartModal(false);
          refreshActiveShift();
        }}
      />
      <CloseShiftModal
        open={showCloseModal}
        shift={activeShift}
        onClose={() => setShowCloseModal(false)}
        onClosed={() => {
          setShowCloseModal(false);
          refreshActiveShift();
        }}
      />
    </div>
  );
}
