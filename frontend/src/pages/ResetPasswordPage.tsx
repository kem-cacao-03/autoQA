import { useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Zap } from "lucide-react";
import { authApi } from "@/lib/api";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30 mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Set new password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Must be at least 8 characters
          </p>
        </div>

        <div className="card p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          <form onSubmit={handleSubmit} className="space-y-5">
            {(["New password", "Confirm password"] as const).map((label, i) => {
              const val = i === 0 ? password : confirm;
              const setter = i === 0 ? setPassword : setConfirm;
              return (
                <div key={label}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      minLength={8}
                      className="input pr-10"
                      placeholder="••••••••"
                      value={val}
                      onChange={(e) => setter(e.target.value)}
                    />
                    {i === 0 && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {error && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !token} className="btn-primary w-full py-3">
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
