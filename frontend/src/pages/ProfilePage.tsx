import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import { User, Lock, CheckCircle, XCircle, Loader2, Camera, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";

export default function ProfilePage() {
  const { user, updateUser, login } = useAuth();

  // Profile form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [imgUrl, setImgUrl] = useState(user?.img_url ?? "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit file size to 2MB
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ ok: false, text: "Image must be smaller than 2 MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImgUrl(ev.target?.result as string);
      setProfileMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setImgUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileLoading(true);
    try {
      const updated = await authApi.updateProfile(fullName, email, imgUrl || undefined);
      updateUser(updated);
      setProfileMsg({ ok: true, text: "Profile updated successfully!" });
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Update failed." });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    setPwMsg(null);
    setPwLoading(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      await login(email, newPw);
      setCurrentPw("");
      setNewPw("");
      setPwMsg({ ok: true, text: "Password changed successfully!" });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to change password." });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your account</p>
      </div>

      {/* ── Profile info ── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Account Details</h2>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-5">

          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={fullName}
                  className="w-24 h-24 rounded-2xl object-cover ring-2 ring-brand-200 dark:ring-brand-700 shadow-md"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-brand-100 to-violet-100 dark:from-brand-900/40 dark:to-violet-900/40 flex items-center justify-center ring-2 ring-brand-200 dark:ring-brand-700 shadow-md">
                  <User className="w-10 h-10 text-brand-400 dark:text-brand-500" />
                </div>
              )}

              {/* Overlay button on hover */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                {imgUrl ? "Change photo" : "Upload photo"}
              </button>
              {imgUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="btn-danger text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG, GIF, WebP · Max 2 MB</p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Full name
            </label>
            <input
              type="text"
              required
              minLength={2}
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in ${profileMsg.ok
              ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"
              }`}>
              {profileMsg.ok
                ? <CheckCircle className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />
              }
              {profileMsg.text}
            </div>
          )}

          <button type="submit" disabled={profileLoading} className="btn-primary w-full">
            {profileLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save changes"}
          </button>
        </form>
      </div>

      {/* ── Change password ── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <Lock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Change password</h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Current password
            </label>
            <input
              type="password"
              required
              className="input"
              placeholder="••••••••"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              New password <span className="text-slate-400 font-normal">(min. 8 characters)</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              className="input"
              placeholder="••••••••"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>

          {pwMsg && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in ${pwMsg.ok
              ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"
              }`}>
              {pwMsg.ok
                ? <CheckCircle className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />
              }
              {pwMsg.text}
            </div>
          )}

          <button type="submit" disabled={pwLoading} className="btn-primary w-full">
            {pwLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Changing...</> : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
