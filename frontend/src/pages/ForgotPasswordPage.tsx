import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Zap } from "lucide-react";
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

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOTP(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setStep(2);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    if (otp.length < OTP_LENGTH) { setError("Please enter the complete 6-digit code."); return; }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(email, otp, password);
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired OTP.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {step === 1 ? "Reset password" : "Set new password"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {step === 1 ? "We'll send a verification code to your email" : `Code sent to ${email}`}
          </p>
        </div>

        <div className="card p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          {step === 1 ? (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? "Sending…" : "Send code"}
              </button>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                <Link to="/login" className="text-brand-600 dark:text-brand-400 font-medium hover:underline">
                  Back to Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <OTPInput value={otp} onChange={setOtp} autoFocus />

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New password <span className="text-slate-400 font-normal">(min. 8 characters)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    className="input pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? "Saving…" : "Reset password"}
              </button>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Didn't receive the code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Resend"}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
