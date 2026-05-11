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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: UserResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount — restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { setLoading(false); return; }
    authApi
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem("access_token"))
      .finally(() => setLoading(false));
  }, []);

  // Listen for token expiry / account-locked signal from the API layer
  useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  // Poll every 30 s to detect remote lock or deletion while the user is active
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      authApi.me().catch(() => {/* auth:expired event handles logout */});
    }, 5_000);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);
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
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
