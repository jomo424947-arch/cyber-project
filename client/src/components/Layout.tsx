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
import { SupportModal } from './SupportModal';
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
  const [showSupportModal, setShowSupportModal] = useState(false);
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

      {/* Top AppBar for Mobile (Active Shift Bar & Status) */}
      {isMobile && (
        <header
          style={{
            height: 'calc(54px + var(--safe-top))',
            paddingTop: 'var(--safe-top)',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '14px',
            paddingRight: '14px',
            borderBottom: '1px solid var(--border-default)',
            backdropFilter: 'blur(16px)',
            background: 'var(--header-bg)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Active Shift status pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  padding: '6px 12px',
                  color: 'var(--accent-green)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 0 10px rgba(34, 197, 94, 0.15)',
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
                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>•</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>
                  +{formatCurrency(Number(effectiveShift.total_revenue || 0))}
                </span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '20px',
                  padding: '5px 10px',
                  color: 'var(--accent-yellow)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--accent-yellow)',
                  }}
                />
                <span>{language === 'ar' ? 'لا توجد وردية' : 'No Shift'}</span>
              </button>
            )}
          </div>

          {/* Quick controls & user tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={toggleTheme}
              style={{
                color: theme === 'dark' ? '#F59E0B' : 'var(--accent-cyan)',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'var(--accent-cyan-dim)',
                border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-glow)',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              title={t('toggle_theme')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: 'var(--accent-cyan-dim)',
                  color: 'var(--accent-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {(user?.full_name ?? '?').charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  maxWidth: '80px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.full_name ? user.full_name : 'Admin'}
              </span>
            </div>
          </div>
        </header>
      )}
      
      <main
        style={{
          marginLeft: isRtl ? 0 : (isMobile ? 0 : 'var(--sidebar-width)'),
          marginRight: isRtl ? (isMobile ? 0 : 'var(--sidebar-width)') : 0,
          padding: isMobile ? '16px' : '32px',
          paddingTop: isMobile ? 'calc(70px + var(--safe-top))' : (title || subtitle ? '96px' : '74px'), // offset fixed top app bar
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
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile && (title || subtitle) ? 'column' : 'row',
              justifyContent: (title || subtitle) ? 'space-between' : (isRtl ? 'flex-start' : 'flex-end'),
              gap: isMobile ? '12px' : '16px',
              marginBottom: (title || subtitle) ? (isMobile ? '20px' : '32px') : '16px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            {(title || subtitle) && (
              <div style={{ width: isMobile ? '100%' : 'auto' }}>
                {title && (
                  <h1
                    className="ccms-page-title"
                    style={{
                      fontSize: isMobile ? '22px' : '32px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      marginTop: '6px',
                      fontSize: isMobile ? '13px' : '15px',
                      fontFamily: 'Inter, sans-serif',
                      opacity: 0.8,
                      wordBreak: 'break-word',
                    }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            )}
            {actions && (
              <div
                style={{
                  display: 'flex',
                  gap: isMobile ? '8px' : '12px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  width: isMobile ? '100%' : 'auto',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  justifyContent: isMobile ? 'stretch' : (isRtl ? 'flex-start' : 'flex-end'),
                }}
              >
                {actions}
              </div>
            )}
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
                <span style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace', fontSize: '9px' }}>{item.label}</span>
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
              <span style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace', fontSize: '9px' }}>{t('more')}</span>
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
                  background: 'rgba(5, 8, 16, 0.75)',
                  backdropFilter: 'blur(6px)',
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
                  maxHeight: 'calc(100vh - 75px)',
                  overflowY: 'auto',
                  background: 'var(--bg-surface)',
                  borderTop: '1px solid var(--border-default)',
                  borderTopLeftRadius: '20px',
                  borderTopRightRadius: '20px',
                  padding: '20px 16px 24px 16px',
                  zIndex: 1001,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: 'var(--shadow-glow-strong)',
                  animation: 'slide-up 0.25s ease-out',
                }}
              >
                {/* Header bar: user info + close button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--accent-cyan-dim)',
                        border: '1px solid var(--border-glow)',
                        color: 'var(--accent-cyan)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '16px',
                      }}
                    >
                      {(user?.full_name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{user?.full_name ?? 'User'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600, marginTop: '1px' }}>
                        {user?.role === 'admin' ? t('administrator') : t('staff_operator')}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowMoreMenu(false)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                    title={language === 'ar' ? 'إغلاق القائمة' : 'Close'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>

                {/* Theme & Language Toggles */}
                <div style={{ display: 'flex', gap: '8px' }}>
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
                      borderRadius: '10px',
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
                      borderRadius: '10px',
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

                {/* Section 1: Operations & Services */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: '4px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>
                    {language === 'ar' ? 'العمليات والخدمات' : 'Operations & Services'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <NavLink
                      to="/products"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>inventory_2</span>
                      <span>{t('products')}</span>
                    </NavLink>

                    <NavLink
                      to="/shifts"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-green)' }}>schedule</span>
                      <span>{t('shifts')}</span>
                    </NavLink>

                    <NavLink
                      to="/expenses"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-red)' }}>receipt_long</span>
                      <span>{t('expenses')}</span>
                    </NavLink>

                    <NavLink
                      to="/billing"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow)' }}>payments</span>
                      <span>{t('billing')}</span>
                    </NavLink>

                    <NavLink
                      to="/reports"
                      onClick={() => setShowMoreMenu(false)}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500,
                        minHeight: '42px',
                      })}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-purple)' }}>query_stats</span>
                      <span>{t('reports')}</span>
                    </NavLink>
                  </div>
                </div>

                {/* Section 2: Administration (Admin Only) */}
                {isAdmin && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', marginBottom: '4px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>
                      {language === 'ar' ? 'لوحة الإدارة والتحكم' : 'Administration'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <NavLink
                        to="/employees"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>badge</span>
                        <span>{t('employees')}</span>
                      </NavLink>

                      <NavLink
                        to="/pricing"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>price_change</span>
                        <span>{t('pricing')}</span>
                      </NavLink>

                      <NavLink
                        to="/settings"
                        onClick={() => setShowMoreMenu(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: isActive ? 'var(--accent-cyan-dim)' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 500,
                          minHeight: '42px',
                        })}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>security</span>
                        <span>{t('settings')}</span>
                      </NavLink>
                    </div>
                  </div>
                )}

                {/* Section 3: Support & Actions */}
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowSupportModal(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: isRtl ? 'right' : 'left',
                      minHeight: '42px',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>headset_mic</span>
                    <span>{t('support')}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      color: 'var(--accent-red)',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: isRtl ? 'right' : 'left',
                      minHeight: '42px',
                      background: 'rgba(255, 68, 102, 0.08)',
                      border: '1px solid rgba(255, 68, 102, 0.2)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
                    <span>{t('logout')}</span>
                  </button>
                </div>
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
      <SupportModal open={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </div>
  );
}
