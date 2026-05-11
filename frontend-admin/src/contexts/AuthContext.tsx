import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "@/lib/api";

interface AdminIdentity {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextValue {
  admin: AdminIdentity | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("admin_access_token");
    if (!token) { setLoading(false); return; }
    authApi
      .me()
      .then((me) => {
        if (me.role !== "admin") {
          localStorage.removeItem("admin_access_token");
          localStorage.removeItem("admin_refresh_token");
          return;
        }
        setAdmin(me);
      })
      .catch(() => {
        localStorage.removeItem("admin_access_token");
        localStorage.removeItem("admin_refresh_token");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handle = () => setAdmin(null);
    window.addEventListener("admin:expired", handle);
    return () => window.removeEventListener("admin:expired", handle);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    localStorage.setItem("admin_access_token", tokens.access_token);
    localStorage.setItem("admin_refresh_token", tokens.refresh_token);
    const me = await authApi.me();
    if (me.role !== "admin") {
      localStorage.removeItem("admin_access_token");
      localStorage.removeItem("admin_refresh_token");
      throw new Error("Access denied. Admin accounts only.");
    }
    setAdmin(me);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    setAdmin(null);
  }, []);

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
