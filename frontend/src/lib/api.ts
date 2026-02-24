const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── Enums / union types ───────────────────────────────────────────────────────

export type GenerationMode = "pipeline" | "research";
export type LLMProvider = "openai" | "gemini" | "claude";
export type TestType = "standard" | "bdd" | "api";
export type JobStatus = "pending" | "running" | "success" | "failure";

// ── Request / response shapes ─────────────────────────────────────────────────

export interface GenerateRequest {
  requirement: string;
  mode: GenerationMode;
  test_type: TestType;
  language: string;
  providers: LLMProvider[];
}

export interface StageUsage {
  stage: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_seconds?: number;
}

export interface ReviewSummary {
  cases_reviewed: number;
  cases_added: number;
  cases_modified: number;
  coverage_score: "high" | "medium" | "low";
}

export interface GenerationResult {
  test_suite_name: string;
  description: string;
  test_cases: Record<string, unknown>[];
  scenarios: Record<string, unknown>[];
  total_count: number;
  provider: string;
  test_type: string;
  mode: string;
  review_summary?: ReviewSummary;
}

export interface ResearchProviderResult {
  provider: string;
  result?: GenerationResult;
  error?: string;
  success: boolean;
  usage?: StageUsage;
}

export interface JobSubmittedResponse {
  job_id: string;
  status: JobStatus;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: number;
  result?: GenerationResult;
  history_id?: string;
  research_results?: ResearchProviderResult[];
  elapsed_seconds?: number;
  usage?: StageUsage[];
  error?: string;
  created_at: string;
}

export interface HistoryItem {
  id: string;
  requirement: string;
  provider: string;
  test_type: string;
  mode: string;
  language: string;
  total_count: number;
  is_favorite: boolean;
  created_at: string;
}

export interface HistoryDetail extends HistoryItem {
  result: GenerationResult;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  img_url?: string;
  created_at: string;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function buildHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function parseError(res: Response): Promise<Error> {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  return new Error(err.detail ?? "Request failed");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers = { ...buildHeaders(token), ...(options.headers as Record<string, string>) };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // ── 401: try to refresh, then retry once ──────────────────────────────────
  if (res.status === 401 && path !== "/auth/refresh") {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json() as { access_token: string; refresh_token: string };
        localStorage.setItem("access_token", tokens.access_token);
        localStorage.setItem("refresh_token", tokens.refresh_token);
        // Retry original request with fresh token
        const retryHeaders = { ...buildHeaders(tokens.access_token), ...(options.headers as Record<string, string>) };
        const retry = await fetch(`${BASE}${path}`, { ...options, headers: retryHeaders });
        if (!retry.ok) throw await parseError(retry);
        if (retry.status === 204) return undefined as T;
        return retry.json();
      }
    }
    // Refresh unavailable or failed — clear session and notify the app
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string, full_name: string) =>
    request<UserResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name }),
    }),

  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<UserResponse>("/auth/me"),

  updateProfile: (full_name: string, email: string, img_url?: string) =>
    request<UserResponse>("/auth/me", {
      method: "PUT",
      body: JSON.stringify({ full_name, email, img_url: img_url || null }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<void>("/auth/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// ── Generator ─────────────────────────────────────────────────────────────────

export const generatorApi = {
  submit: (payload: GenerateRequest) =>
    request<JobSubmittedResponse>("/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getJobStatus: (jobId: string) =>
    request<JobStatusResponse>(`/generate/jobs/${jobId}`),
};

// ── History ───────────────────────────────────────────────────────────────────

export const historyApi = {
  list: (skip = 0, limit = 20, favoritesOnly = false, q?: string) => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
      favorites_only: String(favoritesOnly),
    });
    if (q && q.trim()) params.set("q", q.trim());
    return request<HistoryItem[]>(`/history?${params}`);
  },

  get: (id: string) => request<HistoryDetail>(`/history/${id}`),

  delete: (id: string) =>
    request<void>(`/history/${id}`, { method: "DELETE" }),

  toggleFavorite: (id: string) =>
    request<HistoryItem>(`/history/${id}/favorite`, { method: "POST" }),
};
