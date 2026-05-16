import { Link, useLocation } from "react-router-dom";
import { Zap, LogOut, Sun, Moon, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useGenerator } from "@/contexts/GeneratorContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { loading: generatorLoading } = useGenerator();

  const isActive = (to: string) => pathname === to;

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const navLink = (to: string, label: string, pulse = false) => (
    <Link
      to={to}
      onClick={() => setMenuOpen(false)}
      className={`relative text-sm font-medium px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 ${isActive(to)
        ? "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20"
        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
    >
      {label}
      {pulse && (
        <span
          className="relative flex w-2 h-2 shrink-0"
          title="Generating…"
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-brand-500" />
        </span>
      )}
      {isActive(to) && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-violet-500" />
      )}
    </Link>
  );

  return (
    <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100/80 dark:border-slate-800/80 sticky top-0 z-40 shadow-sm shadow-slate-900/5">
      <div className="container mx-auto px-4 max-w-6xl h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-md shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-shadow duration-200">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent tracking-tight">
            AutoQA Gen
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-0.5 flex-1">
          {user && (
            <>
              {navLink("/", "Generator", generatorLoading)}
              {navLink("/history", "History")}
            </>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
            aria-label="Toggle theme"
          >
            {theme === "dark"
              ? <Sun className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>

          {user ? (
            <>
              {/* Profile — initials avatar */}
              <Link
                to="/profile"
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive("/profile")
                  ? "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {user?.img_url ? (
                  <img
                    src={user.img_url}
                    alt={user.full_name}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-brand-300 dark:ring-brand-600"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center shadow-sm">
                    <span className="text-[10px] font-bold text-white">{initials}</span>
                  </div>
                )}
                <span className="max-w-28 truncate">{user.full_name}</span>
              </Link>


              {/* Logout */}
              <button
                onClick={logout}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-all duration-200"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>

              {/* Mobile menu */}
              <button
                className="sm:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary text-xs px-3 py-1.5">Log in</Link>
              <Link to="/register" className="btn-primary text-xs px-3 py-1.5">Sign up</Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && user && (
        <div className="sm:hidden border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-3 space-y-1 animate-fade-in">
          {navLink("/", "Generator", generatorLoading)}
          {navLink("/history", "History")}
          {navLink("/profile", "Profile")}
          <button
            onClick={() => { logout(); setMenuOpen(false); }}
            className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      )}
    </nav>
  );
}
