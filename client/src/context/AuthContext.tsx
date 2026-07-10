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
  isAuthenticated: boolean;
  isAdmin: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider — cookie-based session management.
 *
 * On mount:
 *  1. Calls GET /api/auth/me to rehydrate the session from the HttpOnly cookie.
 *  2. If /me returns 401, automatically attempts POST /api/auth/refresh once.
 *  3. If refresh also fails, the user is considered logged out.
 *
 * No tokens are stored in localStorage — all auth state is kept in
 * HttpOnly cookies managed exclusively by the backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await dataService.logout();
    } catch {
      // Ignore — cookies will be cleared by the backend.
    }
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      try {
        // Step 1: Try to restore session from the HttpOnly cookie.
        const u = await dataService.getMe();
        if (!cancelled) setUser(u);
      } catch {
        // Step 2: getMe returned 401. Try refreshing the token.
        try {
          const { user: refreshedUser } = await dataService.refresh();
          if (!cancelled) setUser(refreshedUser);
        } catch {
          // Step 3: Refresh also failed — user is logged out.
          if (!cancelled) setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initSession();
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        setUser,
        logout,
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
