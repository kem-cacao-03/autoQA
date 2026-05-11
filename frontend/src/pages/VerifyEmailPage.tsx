import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Loader, Zap } from "lucide-react";
import { authApi } from "@/lib/api";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30 mb-6">
          <Zap className="w-7 h-7 text-white" />
        </div>

        <div className="card p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          {status === "loading" && (
            <>
              <Loader className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Verifying your email…</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Email verified!
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Your account is now active. You can sign in.
              </p>
              <Link to="/login" className="btn-primary px-6 py-2.5 text-sm">
                Sign in
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Link invalid or expired
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                The verification link is no longer valid. Please register again.
              </p>
              <Link to="/register" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline">
                Back to Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
