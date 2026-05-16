import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, type UserResponse } from "@/lib/api";

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  kickNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: UserResponse) => void;
  dismissKickNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [kickNotice, setKickNotice] = useState<string | null>(null);

  // On mount — restore session from sessionStorage
  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { setLoading(false); return; }
    authApi
      .me()
      .then(setUser)
      .catch(() => sessionStorage.removeItem("access_token"))
      .finally(() => setLoading(false));
  }, []);

  // Listen for token expiry / account-locked signal from the API layer.
  // Do NOT set user=null immediately — show a modal first so the user sees why.
  useEffect(() => {
    const handleExpired = (e: Event) => {
      const reason = (e as CustomEvent<{ reason: string }>).detail?.reason
        ?? "Your session has ended. Please sign in again.";
      setKickNotice(reason);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  // Poll every 30 s to keep user data fresh (rate_used, rate_reset_at, lock status, etc.)
  useEffect(() => {
    if (!user) return;
    const refresh = () => authApi.me().then(setUser).catch(() => {/* auth:expired event handles logout */});
    const id = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(id); window.removeEventListener("focus", refresh); };
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    sessionStorage.setItem("access_token", tokens.access_token);
    sessionStorage.setItem("refresh_token", tokens.refresh_token);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const register = useCallback(
    async (email: string, password: string, full_name: string) => {
      await authApi.register(email, password, full_name);
      // Do NOT auto-login — user must verify email first.
    },
    []
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const dismissKickNotice = useCallback(() => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    setKickNotice(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, kickNotice, login, register, logout, updateUser: setUser, dismissKickNotice }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
