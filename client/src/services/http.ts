import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

/**
 * Pre-configured Axios instance for the CCMS backend.
 *
 * Security features:
 * • withCredentials: true   — sends HttpOnly auth cookies automatically.
 * • CSRF header injection   — reads the 'csrf-token' cookie set by the
 *                             backend and attaches it as X-CSRF-Token on
 *                             every mutating request (POST/PATCH/PUT/DELETE).
 * • Silent token refresh    — on a 401, automatically calls /api/auth/refresh
 *                             and retries the original request once.
 *                             If refresh fails, the user is redirected to /login.
 */

const baseURL = import.meta.env.VITE_API_URL || '';

export const http: AxiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send cookies on every request
  timeout: 5000, // Fail fast when backend is unreachable
});

// ─── CSRF Token Injection ─────────────────────────────────────────────────

/** Read a cookie by name from document.cookie. */
function getCookie(name: string): string | null {
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  } catch {
    return null;
  }
}

let csrfTokenInMemory = '';

function getStoredCsrfToken(): string | null {
  return (
    csrfTokenInMemory ||
    getCookie('csrf-token') ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('csrf_token') : null)
  );
}

function setStoredCsrfToken(token: string) {
  if (token) {
    csrfTokenInMemory = token;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('csrf_token', token);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Always attach CSRF token on every request so the server can return
  // a consistent token even on GET responses (critical when third-party
  // cookies are blocked in cross-domain deployments).
  const csrfToken = getStoredCsrfToken();
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// ─── Silent Token Refresh + 401 Retry ────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(ok: boolean) => void> = [];

function onRefreshComplete(ok: boolean) {
  refreshSubscribers.forEach((cb) => cb(ok));
  refreshSubscribers = [];
}

http.interceptors.response.use(
  (res) => {
    const token = res.headers['x-csrf-token'] || res.headers['X-CSRF-Token'];
    if (token) {
      setStoredCsrfToken(token);
    }
    return res;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401 from protected endpoints, and only once.
    // Skip auth init endpoints — AuthContext handles their 401s directly.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/auth/refresh') &&
      !originalRequest.url?.includes('/api/auth/login') &&
      !originalRequest.url?.includes('/api/auth/me') &&
      !originalRequest.url?.includes('/api/auth/status')
    ) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          await http.post('/api/auth/refresh');
          isRefreshing = false;
          onRefreshComplete(true);
        } catch {
          isRefreshing = false;
          onRefreshComplete(false);
          // Refresh failed — let AuthContext handle the redirect via React Router.
          // No manual navigation here to avoid conflicts with AuthContext's own flow.
          return Promise.reject(error);
        }
      }

      // Queue concurrent requests until refresh completes.
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((ok: boolean) => {
          if (ok) {
            resolve(http(originalRequest));
          } else {
            reject(error);
          }
        });
      });
    }

    return Promise.reject(error);
  }
);

// ─── Error Message Utility ────────────────────────────────────────────────

/** Normalizes an axios error into a human-readable message. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any;
  return (
    anyErr?.response?.data?.error?.message ||
    anyErr?.response?.data?.message ||
    anyErr?.message ||
    fallback
  );
}
