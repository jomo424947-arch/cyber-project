import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  serverOffline: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isActivated: boolean;
  activationStatus: string;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  activate: (email: string, password: string) => Promise<void>;
  retryConnection: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider — cookie-based session management.
 *
 * On mount:
 *  1. Checks GET /api/auth/status for desktop licensing.
 *  2. Calls GET /api/auth/me to rehydrate the session from the HttpOnly cookie.
 *  3. If /me returns 401, automatically attempts POST /api/auth/refresh once.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [activationStatus, setActivationStatus] = useState<string>('active');
  const [loading, setLoading] = useState(true);
  const [serverOffline, setServerOffline] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const logout = useCallback(async () => {
    try {
      await dataService.logout();
    } catch {
      // Ignore — cookies will be cleared by the backend.
    }
    setUser(null);
  }, []);

  const activate = useCallback(async (email: string, password: string) => {
    try {
      const res = await dataService.activateTenant(email, password);
      if (res.success) {
        setIsActivated(true);
        setActivationStatus('active');
        // Now try logging in with the same credentials locally
        try {
          const loginRes = await dataService.login(email, password);
          setUser(loginRes.user);
        } catch (loginErr) {
          // If login fails, user just goes to login screen
        }
      }
    } catch (err: any) {
      throw err;
    }
  }, []);

  const retryConnection = useCallback(() => {
    setLoading(true);
    setServerOffline(false);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    /** Returns true if the error is a network/timeout error (server unreachable). */
    function isNetworkError(err: unknown): boolean {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = err as any;
      // Axios sets code to ERR_NETWORK or ECONNABORTED on timeout/connection refused
      if (a?.code === 'ERR_NETWORK' || a?.code === 'ECONNABORTED') return true;
      // No response at all means server didn't respond
      if (a?.message && !a?.response) return true;
      return false;
    }

    async function initSession() {
      try {
        // Step 0: Check activation status
        const statusRes = await dataService.getActivationStatus();
        if (!cancelled) {
          setServerOffline(false);
          setActivationStatus(statusRes.status);
          setIsActivated(statusRes.status === 'active' || statusRes.status === 'trial');
        }

        if (statusRes.status === 'unactivated' || statusRes.status === 'suspended') {
          if (!cancelled) setLoading(false);
          return;
        }

        // Step 1: Try to restore session from the HttpOnly cookie.
        const u = await dataService.getMe();
        if (!cancelled) setUser(u);
      } catch (err) {
        if (isNetworkError(err)) {
          // Server is unreachable — show offline screen.
          if (!cancelled) {
            setServerOffline(true);
            setUser(null);
          }
        } else {
          // Step 2: getMe returned 401. Try refreshing the token.
          try {
            const { user: refreshedUser } = await dataService.refresh();
            if (!cancelled) setUser(refreshedUser);
          } catch (refreshErr) {
            if (isNetworkError(refreshErr)) {
              if (!cancelled) setServerOffline(true);
            }
            // Step 3: Refresh also failed — user is logged out.
            if (!cancelled) setUser(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initSession();
    return () => { cancelled = true; };
  }, [retryCount]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        serverOffline,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isActivated,
        activationStatus,
        setUser,
        logout,
        activate,
        retryConnection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Re-export for convenience so pages don't need to import apiErrorMessage separately.
export { apiErrorMessage };
