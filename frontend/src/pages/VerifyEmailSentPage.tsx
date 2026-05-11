import { useSearchParams, Link } from "react-router-dom";
import { MailCheck, Zap } from "lucide-react";

export default function VerifyEmailSentPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "your email";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30 mb-6">
          <Zap className="w-7 h-7 text-white" />
        </div>

        <div className="card p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <MailCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Check your inbox
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
            We sent a verification link to
          </p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-6">
            {email}
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Click the link in the email to activate your account. The link expires in 24 hours.
          </p>
          <Link
            to="/login"
            className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline"
          >
            Back to Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
