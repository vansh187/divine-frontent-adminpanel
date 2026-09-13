import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import {
  getProfileOverrides,
  getStoredAvatar,
  removeStoredAvatar,
  setProfileOverrides,
  setStoredAvatar,
  type ProfileOverrides,
} from "./profileStorage";

const ACCESS_TOKEN_KEY = "dvi_access_token";
const REFRESH_TOKEN_KEY = "dvi_refresh_token";
const EMAIL_KEY = "dvi_admin_email";

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

interface AuthAdmin {
  email: string;
  fullName?: string;
  employeeId?: string;
  phone?: string;
  designation?: string;
  department?: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  admin: AuthAdmin | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {
    full_name: string;
    employee_id: string;
    email: string;
    password: string;
  }) => Promise<api.AdminUser>;
  logout: () => void;
  updateProfile: (patch: ProfileOverrides) => void;
  updateAvatar: (dataUrl: string) => void;
  removeAvatar: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY)
  );
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));
  const [profileVersion, setProfileVersion] = useState(0);

  const admin = useMemo<AuthAdmin | null>(() => {
    if (!accessToken || !email) return null;
    const claims = parseJwt(accessToken);
    const overrides = getProfileOverrides(email);
    const fullName =
      overrides.fullName ??
      (claims?.full_name as string | undefined) ??
      (claims?.name as string | undefined);
    const employeeId = claims?.employee_id as string | undefined;
    return {
      email,
      fullName,
      employeeId,
      phone: overrides.phone,
      designation: overrides.designation,
      department: overrides.department,
      avatarUrl: getStoredAvatar(email),
    };
    // profileVersion bumps force this memo to re-read localStorage after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, email, profileVersion]);

  const login = useCallback(async (loginEmail: string, password: string) => {
    const tokens = await api.login({ email: loginEmail, password });
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    localStorage.setItem(EMAIL_KEY, loginEmail);
    setAccessToken(tokens.access_token);
    setEmail(loginEmail);
  }, []);

  const signup = useCallback(
    (payload: { full_name: string; employee_id: string; email: string; password: string }) =>
      api.signup(payload),
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setAccessToken(null);
    setEmail(null);
  }, []);

  const updateProfile = useCallback(
    (patch: ProfileOverrides) => {
      if (!email) return;
      setProfileOverrides(email, patch);
      setProfileVersion((v) => v + 1);
    },
    [email]
  );

  const updateAvatar = useCallback(
    (dataUrl: string) => {
      if (!email) return;
      setStoredAvatar(email, dataUrl);
      setProfileVersion((v) => v + 1);
    },
    [email]
  );

  const removeAvatar = useCallback(() => {
    if (!email) return;
    removeStoredAvatar(email);
    setProfileVersion((v) => v + 1);
  }, [email]);

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      accessToken,
      isAuthenticated: !!accessToken,
      login,
      signup,
      logout,
      updateProfile,
      updateAvatar,
      removeAvatar,
    }),
    [admin, accessToken, login, signup, logout, updateProfile, updateAvatar, removeAvatar]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
