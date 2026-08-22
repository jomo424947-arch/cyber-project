import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

/**
 * Pre-configured Axios instance for the CCMS backend.
 *
 * Security features:
 * • withCredentials: true   — sends HttpOnly auth cookies automatically.
 * • Bearer token header     — attaches JWT Authorization header for Desktop/Electron contexts.
 * • CSRF header injection   — reads the 'csrf-token' cookie set by the
 *                             backend and attaches it as X-CSRF-Token on
 *                             every mutating request (POST/PATCH/PUT/DELETE).
 * • Silent token refresh    — on a 401, automatically calls /api/auth/refresh
 *                             and retries the original request once.
 */

function resolveBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const { hostname, port, protocol } = window.location;
    // Check if custom server URL stored in localStorage
    try {
      const storedUrl = localStorage.getItem('ccms_server_url');
      if (storedUrl && storedUrl.trim()) {
        return storedUrl.trim().replace(/\/+$/, '');
      }
    } catch {
      // Ignore storage error
    }

    // If running in browser or mobile on a remote host / LAN IP (e.g. 148.66.152.6 or 192.168.1.X)
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // If served directly from port 5000 or standard web port (80/443), relative '' works seamlessly
      if (port === '5000' || !port || port === '80' || port === '443') {
        return '';
      }
      // If dev server or different port, route to port 5000 on the same host
      return `${protocol}//${hostname}:5000`;
    }
  }
  return envUrl || 'http://localhost:5000';
}

const baseURL = resolveBaseUrl();

export const http: AxiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send cookies on every request
  timeout: 8000, // Fail fast when backend is unreachable
});

// ─── CSRF & Auth Token Storage ─────────────────────────────────────────────

const AUTH_TOKEN_KEY = 'ccms_auth_token';
const REFRESH_TOKEN_KEY = 'ccms_refresh_token';

let authTokenInMemory = '';
let refreshTokenInMemory = '';
let csrfTokenInMemory = '';

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

export function getStoredAuthToken(): string | null {
  return authTokenInMemory || (typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null);
}

export function setStoredAuthToken(token: string | null) {
  authTokenInMemory = token || '';
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
      else localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function getStoredRefreshToken(): string | null {
  return refreshTokenInMemory || (typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null);
}

export function setStoredRefreshToken(token: string | null) {
  refreshTokenInMemory = token || '';
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function clearStoredTokens() {
  setStoredAuthToken(null);
  setStoredRefreshToken(null);
}

export function getStoredCsrfToken(): string | null {
  return (
    csrfTokenInMemory ||
    getCookie('csrf-token') ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('csrf_token') : null)
  );
}

export function setStoredCsrfToken(token: string) {
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

// ─── Request Interceptor ───────────────────────────────────────────────────

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // 1. Attach CSRF token on every request
  const csrfToken = getStoredCsrfToken();
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }

  // 2. Attach Authorization Bearer token (critical for Electron & cross-origin desktop apps)
  const authToken = getStoredAuthToken();
  if (authToken && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }

  return config;
});

// ─── Response Interceptor & Silent Refresh ─────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(ok: boolean) => void> = [];

function onRefreshComplete(ok: boolean) {
  refreshSubscribers.forEach((cb) => cb(ok));
  refreshSubscribers = [];
}

http.interceptors.response.use(
  (res) => {
    // 1. Extract CSRF token
    const csrf = res.headers['x-csrf-token'] || res.headers['X-CSRF-Token'];
    if (csrf) {
      setStoredCsrfToken(csrf);
    }

    // 2. Extract Auth Access Token from header or response body
    const token =
      res.headers['x-access-token'] ||
      res.headers['X-Access-Token'] ||
      (res.data && typeof res.data === 'object' && 'token' in res.data ? (res.data as any).token : null);

    if (token && typeof token === 'string') {
      setStoredAuthToken(token);
    }

    // 3. Extract Refresh Token from header or response body
    const refreshToken =
      res.headers['x-refresh-token'] ||
      res.headers['X-Refresh-Token'] ||
      (res.data && typeof res.data === 'object' && 'refreshToken' in res.data ? (res.data as any).refreshToken : null);

    if (refreshToken && typeof refreshToken === 'string') {
      setStoredRefreshToken(refreshToken);
    }

    return res;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401 from protected endpoints, and only once.
    // Skip auth entry endpoints — AuthContext handles their 401s directly.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/auth/refresh') &&
      !originalRequest.url?.includes('/api/auth/login') &&
      !originalRequest.url?.includes('/api/auth/status')
    ) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const storedRefreshToken = getStoredRefreshToken();
          const refreshRes = await http.post('/api/auth/refresh', {
            refreshToken: storedRefreshToken,
          });

          if (refreshRes.data?.token) {
            setStoredAuthToken(refreshRes.data.token);
          }
          if (refreshRes.data?.refreshToken) {
            setStoredRefreshToken(refreshRes.data.refreshToken);
          }

          isRefreshing = false;
          onRefreshComplete(true);
        } catch {
          isRefreshing = false;
          clearStoredTokens();
          onRefreshComplete(false);
          return Promise.reject(error);
        }
      }

      // Queue concurrent requests until refresh completes.
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((ok: boolean) => {
          if (ok) {
            const freshToken = getStoredAuthToken();
            if (freshToken) {
              originalRequest.headers['Authorization'] = `Bearer ${freshToken}`;
            }
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
