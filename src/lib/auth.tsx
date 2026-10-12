import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";

const ACCESS_TOKEN_KEY = "dvi_access_token";
const REFRESH_TOKEN_KEY = "dvi_refresh_token";

interface AuthAdmin {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  initials: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  admin: AuthAdmin | null;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => void;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** True after the admin was logged out because their token expired or was rejected. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {
    full_name: string;
    employee_id: string;
    email: string;
    password: string;
  }) => Promise<api.AdminUser>;
  logout: () => void;
  uploadAvatar: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Expiry of a JWT access token in ms since epoch, or null if it can't be read. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = tokenExpiryMs(token);
  return exp !== null && exp <= Date.now();
}

/** Reads the stored token, discarding it up front if it has already expired. */
function loadStoredToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token && isTokenExpired(token)) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
  }
  return token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialised before accessToken so it still sees a stored-but-expired token
  // that loadStoredToken is about to discard.
  const [sessionExpired, setSessionExpired] = useState(() => {
    const stored = localStorage.getItem(ACCESS_TOKEN_KEY);
    return !!stored && isTokenExpired(stored);
  });
  const [accessToken, setAccessToken] = useState<string | null>(loadStoredToken);

  const [profile, setProfile] = useState<api.ApiAdminProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    api
      .getAdminProfile(accessToken)
      .then((res) => {
        if (cancelled) return;
        setProfile(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setProfileError(err instanceof api.ApiError ? err.message : "Failed to load your profile.");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, profileRefreshToken]);

  const refreshProfile = useCallback(() => {
    setProfileRefreshToken((v) => v + 1);
  }, []);

  const admin = useMemo<AuthAdmin | null>(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      employeeId: profile.employee_id,
      initials: profile.initials,
      avatarUrl: profile.avatar_url,
    };
  }, [profile]);

  const login = useCallback(async (loginEmail: string, password: string) => {
    const tokens = await api.login({ email: loginEmail, password });
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    setSessionExpired(false);
    setAccessToken(tokens.access_token);
  }, []);

  const signup = useCallback(
    (payload: { full_name: string; employee_id: string; email: string; password: string }) =>
      api.signup(payload),
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setProfile(null);
  }, []);

  const expireSession = useCallback(() => {
    setSessionExpired(true);
    logout();
  }, [logout]);

  // Any authenticated request that comes back 401 (expired/invalid token) logs the
  // admin out here; ProtectedRoute then redirects to /admin/login on the next render.
  useEffect(() => {
    api.setUnauthorizedHandler(expireSession);
    return () => api.setUnauthorizedHandler(null);
  }, [expireSession]);

  // Also log out the moment the token expires, even if the admin is idle on a page
  // and no request is in flight to come back 401.
  useEffect(() => {
    if (!accessToken) return;
    const exp = tokenExpiryMs(accessToken);
    if (exp === null) return;
    // setTimeout overflows past ~24.8 days; tokens never live that long, but clamp anyway.
    const delay = Math.min(Math.max(exp - Date.now(), 0), 2_147_483_647);
    const timer = setTimeout(expireSession, delay);
    return () => clearTimeout(timer);
  }, [accessToken, expireSession]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!accessToken) return;
      const updated = await api.uploadAdminProfilePhoto(accessToken, file);
      setProfile(updated);
    },
    [accessToken]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      profileLoading,
      profileError,
      refreshProfile,
      accessToken,
      isAuthenticated: !!accessToken,
      sessionExpired,
      login,
      signup,
      logout,
      uploadAvatar,
    }),
    [
      admin,
      profileLoading,
      profileError,
      refreshProfile,
      accessToken,
      sessionExpired,
      login,
      signup,
      logout,
      uploadAvatar,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
