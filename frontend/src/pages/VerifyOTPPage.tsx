import { useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { authApi } from "@/lib/api";

const OTP_LENGTH = 6;

function OTPInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="relative flex justify-center gap-2"
      onClick={() => inputRef.current?.focus()}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const isActive = focused && i === value.length;
        return (
          <div
            key={i}
            className={`w-11 h-14 flex items-center justify-center text-xl font-bold rounded-xl border-2 select-none transition-colors
              bg-white dark:bg-slate-800 text-slate-900 dark:text-white
              ${i < value.length || isActive
                ? "border-brand-500 dark:border-brand-400"
                : "border-slate-200 dark:border-slate-700"
              }`}
          >
            {value[i] ?? (isActive
              ? <span className="w-0.5 h-6 bg-brand-500 dark:bg-brand-400 animate-pulse rounded-full" />
              : null
            )}
          </div>
        );
      })}
      {/* Single hidden input captures all typing — no focus-sync issues */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
      />
    </div>
  );
}

export default function VerifyOTPPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < OTP_LENGTH) { setError("Please enter the complete 6-digit code."); return; }
    setError(null);
    setLoading(true);
    try {
      await authApi.verifyOTP(email, otp);
      navigate("/login?verified=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await authApi.resendOTP(email);
      setResent(true);
      setOtp("");
    } catch {
      setError("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30 mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Check your email</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            We sent a 6-digit code to
          </p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
            {email}
          </p>
        </div>

        <div className="card p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          <form onSubmit={handleSubmit} className="space-y-6">
            <OTPInput value={otp} onChange={setOtp} autoFocus />

            {error && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl px-4 py-3 text-sm text-center">
                {error}
              </div>
            )}

            {resent && (
              <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">
                A new code has been sent.
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? "Verifying…" : "Verify Email"}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Didn't receive the code?{" "}
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-brand-600 dark:text-brand-400 font-medium hover:underline disabled:opacity-50"
              >
                {resending ? "Sending…" : "Resend"}
              </button>
            </p>
            <Link to="/login" className="block text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
