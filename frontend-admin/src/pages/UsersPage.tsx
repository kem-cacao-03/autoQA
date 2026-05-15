import { useEffect, useRef, useState } from "react";
import {
  Lock,
  LockOpen,
  Plus,
  Trash2,
  X,
  Gauge,
  ShieldCheck,
  LogOut,
  Settings,
  Save,
  Users,
  UserCheck,
  UserX,
  Crown,
  Search,
  Info,
  Moon,
  Sun,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  adminApi,
  accountApi,
  type AdminStats,
  type AdminUser,
  type CreateUserPayload,
  type GlobalSettings,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        active
          ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400"
      }`}
    >
      {active ? "Active" : "Locked"}
    </span>
  );
}

function RoleSelect({
  user,
  currentAdminId,
  onChange,
}: {
  user: AdminUser;
  currentAdminId: string;
  onChange: (role: "user" | "admin") => void;
}) {
  const isSelf = user.id === currentAdminId;
  if (isSelf) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300">
        admin
      </span>
    );
  }
  return (
    <select
      value={user.role}
      onChange={(e) => onChange(e.target.value as "user" | "admin")}
      className={`text-xs font-medium px-2 py-0.5 rounded border-0 outline-none cursor-pointer transition-colors
        ${user.role === "admin"
          ? "bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300"
          : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
        }`}
    >
      <option value="user">user</option>
      <option value="admin">admin</option>
    </select>
  );
}

// ── Create user modal ─────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState<CreateUserPayload>({
    email: "",
    password: "",
    full_name: "",
    role: "user",
    rate_limit: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await adminApi.createUser(form);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 dark:text-white font-semibold">Create User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(
            [
              { label: "Full Name", key: "full_name", type: "text", placeholder: "Jane Doe" },
              { label: "Email", key: "email", type: "email", placeholder: "jane@example.com" },
              { label: "Password", key: "password", type: "password", placeholder: "Min 8 characters" },
            ] as const
          ).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as "user" | "admin" }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">
                Rate Limit <span className="text-slate-400 dark:text-slate-500">(0 = unlimited)</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.rate_limit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rate_limit: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rate limit edit modal ─────────────────────────────────────────────────────

interface RateLimitModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}

function RateLimitModal({ user, onClose, onSaved }: RateLimitModalProps) {
  const [value, setValue] = useState(user.rate_limit);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const updated = await adminApi.setRateLimit(user.id, value);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-900 dark:text-white font-semibold">Set Rate Limit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {user.full_name} ({user.email})
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">
              Requests / day <span className="text-slate-400 dark:text-slate-500">(0 = unlimited)</span>
            </label>
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-brand-500"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Change password modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
    setError("");
    setLoading(true);
    try {
      await accountApi.changePassword(currentPw, newPw);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 dark:text-white font-semibold">Change Password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
              Password changed successfully.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {([
              { label: "Current password", value: currentPw, set: setCurrentPw, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
              { label: "New password", value: newPw, set: setNewPw, show: showNew, toggle: () => setShowNew(v => !v) },
            ] as const).map(({ label, value, set, show, toggle }) => (
              <div key={label}>
                <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">{label}</label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={toggle}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value ?? "—"}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { admin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [rateLimitTarget, setRateLimitTarget] = useState<AdminUser | null>(null);

  // Stats
  const [stats, setStats] = useState<AdminStats | undefined>();

  // Filters
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings state
  const [settings, setSettings] = useState<GlobalSettings>({ default_rate_limit: 0, registration_open: true, rate_reset_hour: 0 });
  const [settingsInput, setSettingsInput] = useState(0);
  const [regOpen, setRegOpen] = useState(true);
  const [resetHour, setResetHour] = useState(0);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  async function fetchUsers(offset = 0, q = search, role = filterRole, status = filterStatus) {
    setLoading(true);
    setError("");
    try {
      const isActive = status === "active" ? true : status === "locked" ? false : undefined;
      const data = await adminApi.listUsers(offset, PAGE_SIZE, q || undefined, role || undefined, isActive);
      setUsers(data.items);
      setTotal(data.total);
      setSkip(offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      setStats(await adminApi.getStats());
    } catch { /* non-critical */ }
  }

  async function fetchSettings() {
    try {
      const s = await adminApi.getSettings();
      setSettings(s);
      setSettingsInput(s.default_rate_limit);
      setRegOpen(s.registration_open);
      setResetHour(s.rate_reset_hour ?? 0);
    } catch { /* non-critical */ }
  }

  useEffect(() => { fetchUsers(0); fetchStats(); fetchSettings(); }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchUsers(0, value, filterRole, filterStatus);
    }, 350);
  }

  function handleFilterChange(role: string, status: string) {
    setFilterRole(role);
    setFilterStatus(status);
    fetchUsers(0, search, role, status);
  }

  function patchUser(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function toggleStatus(user: AdminUser) {
    const action = user.is_active ? "Lock" : "Unlock";
    if (!confirm(`${action} account for ${user.full_name} (${user.email})?`)) return;
    try {
      const updated = await adminApi.setStatus(user.id, !user.is_active);
      patchUser(updated);
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function handleRoleChange(user: AdminUser, role: "user" | "admin") {
    try {
      const updated = await adminApi.setRole(user.id, role);
      patchUser(updated);
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  const settingsChanged =
    settingsInput !== settings.default_rate_limit ||
    regOpen !== settings.registration_open ||
    resetHour !== (settings.rate_reset_hour ?? 0);

  async function handleSaveSettings() {
    setSettingsSaving(true);
    try {
      const s = await adminApi.updateSettings({
        default_rate_limit: settingsInput,
        registration_open: regOpen,
        rate_reset_hour: resetHour,
      });
      setSettings(s);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!confirm(`Delete ${user.full_name} (${user.email})? This cannot be undone.`)) return;
    try {
      await adminApi.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setTotal((t) => t - 1);
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          <span className="font-semibold text-slate-900 dark:text-white">AutoQA Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">{admin?.email}</span>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowChangePw(true)}
            title="Change password"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Users} label="Total Users" value={stats?.total} color="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" />
          <StatCard icon={UserCheck} label="Active" value={stats?.active} color="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400" />
          <StatCard icon={UserX} label="Locked" value={stats?.locked} color="bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-400" />
          <StatCard icon={Crown} label="Admins" value={stats?.admins} color="bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-400" />
        </div>

        {/* Settings panel */}
        <div className="mb-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Global settings</span>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Default rate limit <span className="text-slate-400 dark:text-slate-600">(req/day · 0 = unlimited)</span>
              </label>
              <input
                type="number"
                min={0}
                value={settingsInput}
                onChange={(e) => setSettingsInput(Number(e.target.value))}
                className="w-36 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1 group relative w-fit">
                <label className="text-xs text-slate-500 dark:text-slate-400">Registration</label>
                <Info className="w-3 h-3 text-slate-400 dark:text-slate-600 cursor-default" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  When <span className="text-rose-400 font-medium">Closed</span>, new users cannot sign up. Existing accounts are not affected.
                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
                </div>
              </div>
              <button
                onClick={() => setRegOpen((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  regOpen
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                    : "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${regOpen ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"}`} />
                {regOpen ? "Open" : "Closed"}
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Rate reset hour <span className="text-slate-400 dark:text-slate-600">(UTC · 0–23)</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={resetHour}
                  onChange={(e) => setResetHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                  className="w-20 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-brand-500"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">:00 UTC</span>
              </div>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving || !settingsChanged}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {settingsSaving ? "Saving…" : settingsSaved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => handleFilterChange(e.target.value, filterStatus)}
              className="px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">All roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => handleFilterChange(filterRole, e.target.value)}
              className="px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="locked">Locked</option>
            </select>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New User
          </button>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">{total} account{total !== 1 ? "s" : ""} found</p>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Rate Limit</th>
                <th className="px-4 py-3 font-medium">Used Today</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{user.full_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        user={user}
                        currentAdminId={admin?.id ?? ""}
                        onChange={(role) => handleRoleChange(user, role)}
                      />
                    </td>
                    <td className="px-4 py-3"><Badge active={user.is_active} /></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {user.rate_limit === 0 ? (
                        <span className="text-slate-400 dark:text-slate-500">Unlimited</span>
                      ) : (
                        `${user.rate_limit} / day`
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {user.rate_limit === 0 ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        user.rate_used
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.id !== admin?.id && (
                          <button
                            onClick={() => toggleStatus(user)}
                            title={user.is_active ? "Lock account" : "Unlock account"}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            {user.is_active ? (
                              <Lock className="w-4 h-4" />
                            ) : (
                              <LockOpen className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setRateLimitTarget(user)}
                          title="Set rate limit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Gauge className="w-4 h-4" />
                        </button>
                        {user.id !== admin?.id && (
                          <button
                            onClick={() => handleDelete(user)}
                            title="Delete user"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-500 dark:text-slate-400">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={skip === 0}
                onClick={() => fetchUsers(skip - PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                disabled={skip + PAGE_SIZE >= total}
                onClick={() => fetchUsers(skip + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => {
            setUsers((prev) => [user, ...prev]);
            setTotal((t) => t + 1);
            setShowCreate(false);
            fetchStats();
          }}
        />
      )}
      {rateLimitTarget && (
        <RateLimitModal
          user={rateLimitTarget}
          onClose={() => setRateLimitTarget(null)}
          onSaved={(updated) => {
            patchUser(updated);
            setRateLimitTarget(null);
          }}
        />
      )}
    </div>
  );
}
