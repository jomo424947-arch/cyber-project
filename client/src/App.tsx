import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import RoomsPage from './pages/RoomsPage';
import DevicesPage from './pages/DevicesPage';
import SessionsPage from './pages/SessionsPage';
import ProductsPage from './pages/ProductsPage';
import BillingPage from './pages/BillingPage';
import ReservationsPage from './pages/ReservationsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import PricingPage from './pages/PricingPage';
import EmployeesPage from './pages/EmployeesPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import SuperAdminPage from './pages/SuperAdminPage';

/** Wraps a page with the auth gate — redirects to /login if not authenticated. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Wraps an admin-only page — redirects staff to /dashboard. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function FullPageLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}
    >
      <LoadingSpinner />
    </div>
  );
}

/** Shown when the Express backend server is unreachable. */
function ServerOfflineScreen() {
  const { retryConnection, loading } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          maxWidth: '420px',
          textAlign: 'center',
          padding: '48px 32px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '20px',
          boxShadow: '0 0 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Server icon with pulse animation */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '2px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </div>

        <h2
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          Server Offline
        </h2>

        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
          }}
        >
          Cannot connect to the backend server. Make sure the server is running before starting the application.
        </p>

        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            direction: 'rtl',
          }}
        >
          لا يمكن الاتصال بالسيرفر. تأكد من تشغيل السيرفر قبل فتح التطبيق.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
            marginTop: '8px',
          }}
        >
          <button
            className="ccms-btn ccms-btn-primary"
            onClick={retryConnection}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            ) : null}
            {loading ? 'Connecting…' : 'Retry Connection'}
          </button>
        </div>

        <div
          style={{
            marginTop: '8px',
            padding: '12px 16px',
            background: 'rgba(0, 194, 255, 0.05)',
            border: '1px solid rgba(0, 194, 255, 0.1)',
            borderRadius: '10px',
            width: '100%',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', color: 'var(--accent-yellow)', marginRight: '4px' }}>lightbulb</span> Run <span style={{ color: 'var(--accent-cyan)' }}>npm run server</span> in the terminal first, then retry.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isActivated, activationStatus, loading, serverOffline } = useAuth();

  // Show loading spinner while checking auth state
  if (loading) return <FullPageLoader />;

  // Show server offline screen when backend is unreachable
  if (serverOffline) return <ServerOfflineScreen />;

  const isSuperAdminRoute = window.location.href.includes('super-admin');

  if (!isActivated && !isSuperAdminRoute) {
    return <AuthPage forceView={activationStatus === 'suspended' ? 'suspended' : 'activate'} />;
  }

  // isAuthenticated drives the route guards below. When the user logs in
  // (or refreshes to restore a session), `isAuthenticated` becomes true and
  // the /login route automatically redirects to /dashboard.

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />

      {/* These routes intentionally render AuthPage — the page itself
          reads ?view=reset or the URL hash to show the correct form. */}
      <Route path="/reset-password" element={<AuthPage />} />
      <Route path="/verify-email"   element={<AuthPage />} />

      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/rooms" element={<ProtectedRoute><RoomsPage /></ProtectedRoute>} />
      <Route path="/devices" element={<ProtectedRoute><DevicesPage /></ProtectedRoute>} />
      <Route path="/sessions" element={<ProtectedRoute><SessionsPage /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="/reservations" element={<ProtectedRoute><ReservationsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      <Route path="/pricing" element={<AdminRoute><PricingPage /></AdminRoute>} />
      <Route path="/employees" element={<AdminRoute><EmployeesPage /></AdminRoute>} />
      <Route path="/super-admin" element={<SuperAdminPage />} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerProfilePage /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}