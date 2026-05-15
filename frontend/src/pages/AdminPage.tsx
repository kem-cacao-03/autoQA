import { useState, useEffect, useCallback } from "react";
import {
  Users, Settings, Shield, Lock, Unlock, Trash2,
  UserPlus, Search, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Crown, User, Loader2,
  RefreshCw, Save, ToggleLeft, ToggleRight,
} from "lucide-react";
import {
  adminApi,
  type AdminUserResponse, type AdminUserListResponse, type GlobalSettings,
} from "@/lib/api";

// ── Inline edit dialog ─────────────────────────────────────────────────────────

function InlineInput({
  value, onSave, onCancel, type = "number", min, max,
}: {
  value: string | number; onSave: (v: string) => void;
  onCancel: () => void; type?: string; min?: number; max?: number;
}) {
  const [val, setVal] = useState(String(value));
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus type={type} value={val} min={min} max={max}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(val); if (e.key === "Escape") onCancel(); }}
        className="input py-1 px-2 text-xs w-24"
      />
      <button onClick={() => onSave(val)} className="text-emerald-500 hover:text-emerald-600"><CheckCircle className="w-4 h-4" /></button>
      <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><XCircle className="w-4 h-4" /></button>
    </div>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({
  user, onRefresh,
}: { user: AdminUserResponse; onRefresh: () => void }) {
  const [editField, setEditField] = useState<"rate_limit" | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onRefresh(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const toggleStatus = () => run(() => adminApi.setStatus(user.id, !user.is_active));
  const toggleRole   = () => run(() => adminApi.setRole(user.id, user.role === "admin" ? "user" : "admin"));
  const del          = () => { if (confirm(`Delete ${user.email}?`)) run(() => adminApi.deleteUser(user.id)); };
  const saveRL       = (v: string) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0) return;
    run(() => adminApi.setRateLimit(user.id, n));
    setEditField(null);
  };

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">
              {user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">{user.full_name}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{user.email}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <span className={`badge text-[10px] flex items-center gap-1 w-fit ${
          user.role === "admin"
            ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-100 dark:border-violet-800/30"
            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
        }`}>
          {user.role === "admin" ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
          {user.role}
        </span>
      </td>

      <td className="px-4 py-3">
        <span className={`badge text-[10px] flex items-center gap-1 w-fit ${
          user.is_active
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30"
            : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-100 dark:border-rose-800/30"
        }`}>
          {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {user.is_active ? "Active" : "Locked"}
        </span>
      </td>

      <td className="px-4 py-3">
        {editField === "rate_limit" ? (
          <InlineInput value={user.rate_limit} onSave={saveRL} onCancel={() => setEditField(null)} min={0} />
        ) : (
          <button
            onClick={() => setEditField("rate_limit")}
            className="text-xs tabular-nums text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium"
            title="Click to edit"
          >
            {user.rate_limit === 0 ? "Unlimited" : `${user.rate_used} / ${user.rate_limit}`}
          </button>
        )}
      </td>

      <td className="px-4 py-3">
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {new Date(user.created_at).toLocaleDateString()}
        </p>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {busy
            ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
            : (
              <>
                <button
                  onClick={toggleStatus}
                  title={user.is_active ? "Lock account" : "Unlock account"}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {user.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={toggleRole}
                  title={user.role === "admin" ? "Demote to user" : "Promote to admin"}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  <Crown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={del}
                  title="Delete user"
                  className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )
          }
        </div>
      </td>
    </tr>
  );
}

// ── Create user modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [role, setRole]         = useState<"user" | "admin">("user");
  const [rateLimit, setRateLimit] = useState(0);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.createUser(email, password, name, role, rateLimit);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Create User</h2>
        <form onSubmit={submit} className="space-y-3">
          <input required type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="input text-sm py-2" />
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="input text-sm py-2" />
          <input required type="password" placeholder="Password (min 8 chars)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input text-sm py-2" />
          <div className="flex gap-3">
            <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")} className="input text-sm py-2 flex-1">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input type="number" min={0} placeholder="Rate limit (0=∞)" value={rateLimit} onChange={(e) => setRateLimit(parseInt(e.target.value) || 0)} className="input text-sm py-2 w-40" />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1 text-sm disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [data, setData]         = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const [page, setPage]         = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const LIMIT = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(page * LIMIT, LIMIT, query || undefined);
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" placeholder="Search by name or email…"
            value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            className="input pl-8 text-sm py-2"
          />
        </div>
        <button onClick={load} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" /> Create User
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">User</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Rate Limit</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Created</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <UserRow key={u.id} user={u} onRefresh={load} />
                ))}
                {!data?.items.length && (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <span className="text-xs text-slate-400">
              {data?.total} users · page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings]   = useState<GlobalSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    adminApi.getSettings()
      .then(setSettings)
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
    </div>
  );

  if (!settings) return <p className="text-sm text-rose-500 py-8">{error}</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div className="card p-6 space-y-5">
        {/* Registration toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Open Registration</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Allow new users to register via the sign-up page.</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, registration_open: !settings.registration_open })}
            className="shrink-0 mt-0.5"
          >
            {settings.registration_open
              ? <ToggleRight className="w-8 h-8 text-brand-500" />
              : <ToggleLeft  className="w-8 h-8 text-slate-400" />
            }
          </button>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        {/* Default rate limit */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Default Rate Limit
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Applied to new users on verification. 0 means unlimited.
          </p>
          <input
            type="number" min={0} value={settings.default_rate_limit}
            onChange={(e) => setSettings({ ...settings, default_rate_limit: parseInt(e.target.value) || 0 })}
            className="input text-sm py-2 w-32"
          />
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        {/* Rate reset hour */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Rate Limit Reset Hour (UTC)
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Hour of day (0–23 UTC) when daily usage counters reset. Currently: {settings.rate_reset_hour}:00 UTC.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} max={23} value={settings.rate_reset_hour}
              onChange={(e) => {
                const v = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
                setSettings({ ...settings, rate_reset_hour: v });
              }}
              className="input text-sm py-2 w-20"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">:00 UTC</span>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "settings">("users");
  const [stats, setStats] = useState<{ total: number; active: number; locked: number; admins: number } | null>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => null);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">Manage users and system settings</p>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Users",  value: stats.total,   color: "text-slate-700 dark:text-slate-200"   },
            { label: "Active",       value: stats.active,  color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Locked",       value: stats.locked,  color: "text-rose-600 dark:text-rose-400"      },
            { label: "Admins",       value: stats.admins,  color: "text-violet-600 dark:text-violet-400"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="card p-1 inline-flex gap-1">
        {(["users", "settings"] as const).map((t) => (
          <button
            key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 ${tab === t
              ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-500/20"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            }`}
          >
            {t === "users" ? <Users className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
            {t === "users" ? "Users" : "Settings"}
          </button>
        ))}
      </div>

      {tab === "users"    && <UsersTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
