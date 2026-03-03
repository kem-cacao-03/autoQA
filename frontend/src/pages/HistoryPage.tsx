import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  History, Star, Trash2, ChevronRight,
  Clock, FileText, Loader2, XCircle, Filter,
  FileJson, FileSpreadsheet, Sparkles, Search, X,
} from "lucide-react";
import { historyApi, type HistoryItem, type HistoryDetail } from "@/lib/api";
import { TestCaseCard } from "@/components/TestCaseCard";
import { FilenameDialog } from "@/components/FilenameDialog";
import { SortBar, sortCases, filterCases, getCategories, toggleSort, type SortState } from "@/components/SortBar";
import { downloadJSON, downloadExcel } from "@/lib/export";

const MODE_STYLES: Record<string, { label: string; badge: string; border: string }> = {
  pipeline: { label: "Standard", badge: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-100 dark:border-brand-800/30", border: "border-l-brand-500" },
  research: { label: "Research", badge: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-100 dark:border-violet-800/30", border: "border-l-violet-500" },
};

const PROVIDER_LABELS: Record<string, string> = { openai: "GPT-4o", gemini: "Gemini", claude: "Claude" };

const TYPE_LABELS: Record<string, string> = { standard: "Standard", bdd: "BDD", api: "API" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(sec: number) {
  return sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`;
}

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tokens` : `${n} tokens`;
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [exportDialog, setExportDialog] = useState<{ type: "json" | "excel"; name: string } | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cardGen, setCardGen] = useState(0);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Reset category filter + collapse all cards when switching providers in research mode
  useEffect(() => { setCategoryFilter(null); setCardGen((g) => g + 1); }, [selectedProvider]);

  const openExportDialog = (type: "json" | "excel") => {
    if (!detail) return;
    const p = selectedProvider ?? detail.provider;
    const providerLabel = PROVIDER_LABELS[p] ?? p;
    const name = detail.mode === "research"
      ? `TestSuite_Research_${providerLabel}`
      : "TestSuite_Standard";
    setExportDialog({ type, name });
  };

  useEffect(() => {
    historyApi.get(id).then((d) => {
      setDetail(d);
      if (d.all_results && d.all_results.length > 0) {
        setSelectedProvider(d.all_results[0].provider);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const isResearch = !!(detail?.mode === "research" && detail.all_results && detail.all_results.length > 1);
  const activeResult = isResearch && selectedProvider
    ? (detail!.all_results!.find((r) => r.provider === selectedProvider) ?? detail!.result)
    : detail?.result ?? null;

  const rawItems = activeResult
    ? (activeResult.test_cases ?? [])
    : [];
  const categories = getCategories(rawItems as Record<string, unknown>[]);
  const items = sortCases(filterCases(rawItems as Record<string, unknown>[], categoryFilter), sort) as typeof rawItems;

  const modeStyle = MODE_STYLES[detail?.mode ?? "pipeline"] ?? MODE_STYLES.pipeline;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-5xl bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-y-auto overscroll-contain animate-slide-up mb-8"
        style={{ maxHeight: "calc(100vh - 80px)", scrollbarGutter: "stable" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-brand-600 to-violet-600 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {detail && (
                <>
                  <h2 className="text-base font-bold text-white line-clamp-2">
                    {activeResult?.test_suite_name ?? detail.result.test_suite_name}
                  </h2>
                  <p className="text-white/80 text-xs mt-0.5">{formatDate(detail.created_at)}</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {detail && activeResult && (
                <>
                  <button className="btn-secondary text-xs bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => openExportDialog("json")}>
                    <FileJson className="w-3.5 h-3.5" /> JSON
                  </button>
                  <button className="btn-secondary text-xs bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => openExportDialog("excel")}>
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                  </button>
                </>
              )}
              <button className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-colors" onClick={onClose}>
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          )}

          {detail && !loading && (
            <>
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`badge ${modeStyle.badge}`}>{modeStyle.label}</span>
                <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {detail.language}
                </span>
                <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                  {(activeResult?.total_count ?? detail.total_count)} test cases
                </span>
                {/* Per-provider stats in research mode; overall stats in pipeline mode */}
                {(() => {
                  const stats = isResearch && selectedProvider && detail.provider_stats
                    ? detail.provider_stats[selectedProvider]
                    : detail;
                  return (
                    <>
                      {stats?.elapsed_seconds != null && (
                        <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatElapsed(stats.elapsed_seconds)}
                        </span>
                      )}
                      {(stats?.total_tokens ?? 0) > 0 && (
                        <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          {formatTokens(stats!.total_tokens)}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Requirement */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Requirement</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{detail.requirement}</p>
              </div>

              {/* Research provider tabs */}
              {isResearch && (
                <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
                  {detail.all_results!.map((r) => (
                    <button
                      key={r.provider}
                      onClick={() => setSelectedProvider(r.provider)}
                      className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                        selectedProvider === r.provider
                          ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {PROVIDER_LABELS[r.provider] ?? r.provider}
                      <span className="ml-1.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                        {r.total_count}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Test cases */}
              {items.length > 0 && (
                <SortBar
                  sort={sort}
                  onToggle={(k) => { setSort((p) => toggleSort(p, k)); setCardGen((g) => g + 1); }}
                  onReset={() => { setSort(null); setCategoryFilter(null); setCardGen((g) => g + 1); }}
                  categories={categories}
                  categoryFilter={categoryFilter}
                  onCategoryFilter={(cat) => { setCategoryFilter(cat); setCardGen((g) => g + 1); }}
                  total={items.length}
                />
              )}
              <div className="space-y-2">
                {items.map((tc, i) => (
                  <TestCaseCard key={`${i}-${cardGen}`} tc={tc as Record<string, unknown>} index={i} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {exportDialog && activeResult && (
        <FilenameDialog
          defaultName={exportDialog.name}
          extension={exportDialog.type === "json" ? "json" : "xlsx"}
          onConfirm={(filename) => {
            if (exportDialog.type === "json") downloadJSON(activeResult, undefined, filename);
            else downloadExcel(activeResult, undefined, filename);
          }}
          onClose={() => setExportDialog(null)}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input — wait 400 ms after user stops typing
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await historyApi.list(0, 50, favoritesOnly, debouncedSearch || undefined); setItems(data); }
    finally { setLoading(false); }
  }, [favoritesOnly, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const handleToggleFav = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = await historyApi.toggleFavorite(id);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, is_favorite: updated.is_favorite } : it)));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this record?")) return;
    setDeletingId(id);
    try { await historyApi.delete(id); setItems((prev) => prev.filter((it) => it.id !== id)); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                <History className="w-4 h-4 text-white" />
              </div>
              History
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {items.length} record{items.length !== 1 ? "s" : ""}
              {favoritesOnly ? " · ⭐ favorites" : ""}
              {debouncedSearch ? ` · "${debouncedSearch}"` : ""}
            </p>
          </div>

          <button
            className={`btn-secondary shrink-0 ${favoritesOnly ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : ""}`}
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <Filter className="w-4 h-4" />
            {favoritesOnly ? "All records" : "Favorites"}
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by requirement…"
            className="input pl-9 pr-9 text-sm"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            <p className="text-sm text-slate-400">Loading history…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="card p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-100 to-violet-100 dark:from-brand-900/30 dark:to-violet-900/30 flex items-center justify-center mx-auto mb-4">
            {debouncedSearch
              ? <Search className="w-7 h-7 text-slate-400" />
              : favoritesOnly
                ? <Star className="w-7 h-7 text-amber-400" />
                : <FileText className="w-7 h-7 text-brand-400" />
            }
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
            {debouncedSearch
              ? `No results for "${debouncedSearch}"`
              : favoritesOnly ? "No favorites yet" : "No test cases generated yet"}
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {debouncedSearch
              ? "Try a different keyword."
              : favoritesOnly
                ? "Star a record to save it here."
                : "Head to the Generator to create your first test suite."}
          </p>
          {!favoritesOnly && !debouncedSearch && (
            <a href="/" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-500/20 hover:shadow-lg transition-shadow">
              <Sparkles className="w-3.5 h-3.5" /> Start Generating
            </a>
          )}
        </div>
      )}

      {/* List */}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const modeStyle = MODE_STYLES[item.mode] ?? MODE_STYLES.pipeline;
            return (
              <div
                key={item.id}
                className={`group card border-l-4 ${modeStyle.border} p-4 flex items-center gap-4 hover:shadow-md hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60 transition-all duration-200`}
                onClick={() => setSelectedId(item.id)}
              >
                {/* Star button */}
                <button
                  className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${item.is_favorite
                    ? "text-amber-400 bg-amber-50 dark:bg-amber-900/20"
                    : "text-slate-300 dark:text-slate-600 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    }`}
                  onClick={(e) => handleToggleFav(e, item.id)}
                >
                  <Star className={`w-4 h-4 ${item.is_favorite ? "fill-current" : ""}`} />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1 mb-1.5">
                    {item.requirement}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(item.created_at)}</span>
                    {item.elapsed_seconds != null && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{formatElapsed(item.elapsed_seconds)}</span>
                    )}
                    {item.total_tokens > 0 && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{formatTokens(item.total_tokens)}</span>
                    )}
                    <span className={`badge ${modeStyle.badge}`}>{modeStyle.label}</span>
                    {item.mode === "research" ? (
                      item.providers.map((p) => (
                        <span key={p} className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {PROVIDER_LABELS[p] ?? p}
                        </span>
                      ))
                    ) : (
                      <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                        {item.total_count} cases
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="btn-danger p-2"
                    onClick={(e) => handleDelete(e, item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition-colors shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {selectedId && <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
