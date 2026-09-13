import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY)
  );
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));

  const admin = useMemo<AuthAdmin | null>(() => {
    if (!accessToken || !email) return null;
    const claims = parseJwt(accessToken);
    const fullName =
      (claims?.full_name as string | undefined) ?? (claims?.name as string | undefined);
    return { email, fullName };
  }, [accessToken, email]);

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

  const value = useMemo<AuthContextValue>(
    () => ({ admin, accessToken, isAuthenticated: !!accessToken, login, signup, logout }),
    [admin, accessToken, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
