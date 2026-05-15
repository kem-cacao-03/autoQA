const BASE = "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  img_url: string | null;
  role: string;
  is_active: boolean;
  rate_limit: number;
  rate_used: number;
  rate_reset_at: string | null;
  created_at: string;
}

export interface UserListResponse {
  total: number;
  items: AdminUser[];
}

export interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: "user" | "admin";
  rate_limit: number;
}

export interface GlobalSettings {
  default_rate_limit: number;
  registration_open: boolean;
  rate_reset_hour: number;
}

export interface AdminStats {
  total: number;
  active: number;
  locked: number;
  admins: number;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = localStorage.getItem("admin_access_token");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    window.dispatchEvent(new Event("admin:expired"));
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string }>("POST", "/auth/login", {
      email,
      password,
    }),

  me: () => request<{ id: string; email: string; full_name: string; role: string }>("GET", "/auth/me"),
};

// ── Account ───────────────────────────────────────────────────────────────────

export const accountApi = {
  changePassword: (current_password: string, new_password: string) =>
    request<void>("PUT", "/auth/me/password", { current_password, new_password }),
};

// ── Admin users ───────────────────────────────────────────────────────────────

export const adminApi = {
  getStats: () =>
    request<AdminStats>("GET", "/admin/stats"),

  listUsers: (
    skip = 0,
    limit = 20,
    q?: string,
    role?: string,
    is_active?: boolean,
  ) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (is_active !== undefined) params.set("is_active", String(is_active));
    return request<UserListResponse>("GET", `/admin/users?${params}`);
  },

  createUser: (payload: CreateUserPayload) =>
    request<AdminUser>("POST", "/admin/users", payload),

  setStatus: (userId: string, is_active: boolean) =>
    request<AdminUser>("PATCH", `/admin/users/${userId}/status`, { is_active }),

  setRateLimit: (userId: string, rate_limit: number) =>
    request<AdminUser>("PATCH", `/admin/users/${userId}/rate-limit`, { rate_limit }),

  setRole: (userId: string, role: "user" | "admin") =>
    request<AdminUser>("PATCH", `/admin/users/${userId}/role`, { role }),

  deleteUser: (userId: string) =>
    request<void>("DELETE", `/admin/users/${userId}`),

  getSettings: () =>
    request<GlobalSettings>("GET", "/admin/settings"),

  updateSettings: (payload: { default_rate_limit: number; registration_open: boolean; rate_reset_hour: number }) =>
    request<GlobalSettings>("PATCH", "/admin/settings", payload),
};
