import { ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";

export type SortKey = "priority";
export type SortDir = "asc" | "desc";
export interface SortState { key: SortKey; dir: SortDir }

// Priority weight: higher = more important
const PRIORITY_W: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** Pure sort helper — returns a new sorted array, never mutates. */
export function sortCases(
  cases: Record<string, unknown>[],
  sort: SortState | null,
): Record<string, unknown>[] {
  if (!sort) return cases;
  return [...cases].sort((a, b) => {
    const wa = PRIORITY_W[String(a.priority ?? "Medium")] ?? 2;
    const wb = PRIORITY_W[String(b.priority ?? "Medium")] ?? 2;
    // desc = High first, asc = Low first
    return sort.dir === "desc" ? wb - wa : wa - wb;
  });
}

/** Pure filter helper — returns only cases matching the given category. */
export function filterCases(
  cases: Record<string, unknown>[],
  category: string | null,
): Record<string, unknown>[] {
  if (!category) return cases;
  return cases.filter((c) => String(c.category ?? "") === category);
}

/** Derive sorted unique category values from a case list. */
export function getCategories(cases: Record<string, unknown>[]): string[] {
  return [...new Set(cases.map((c) => String(c.category ?? "")).filter(Boolean))].sort();
}

/** Toggle helper: none→desc→asc→none */
export function toggleSort(
  prev: SortState | null,
  key: SortKey,
): SortState | null {
  if (!prev || prev.key !== key) return { key, dir: "desc" };
  if (prev.dir === "desc") return { key, dir: "asc" };
  return null;
}

// ── UI component ──────────────────────────────────────────────────────────────

interface SortBarProps {
  sort: SortState | null;
  onToggle: (key: SortKey) => void;
  onReset: () => void;
  categories?: string[];
  categoryFilter?: string | null;
  onCategoryFilter?: (cat: string | null) => void;
  total?: number;
}

function SortIcon({ sort }: { sort: SortState | null }) {
  if (!sort) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
  return sort.dir === "desc"
    ? <ArrowDown className="w-3 h-3" />
    : <ArrowUp className="w-3 h-3" />;
}

export function SortBar({
  sort,
  onToggle,
  onReset,
  categories,
  categoryFilter,
  onCategoryFilter,
  total,
}: SortBarProps) {
  const hasActive = sort !== null || !!categoryFilter;

  const handleReset = () => {
    onReset();
    onCategoryFilter?.(null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort by priority */}
      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
        Sort
      </span>
      <button
        onClick={() => onToggle("priority")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
          sort
            ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
        }`}
      >
        Priority
        <SortIcon sort={sort} />
      </button>

      {/* Filter by category */}
      {categories && categories.length > 0 && (
        <>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-600 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
            Filter
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryFilter?.(categoryFilter === cat ? null : cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === cat
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </>
      )}

      {hasActive && (
        <button
          onClick={handleReset}
          className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="w-3 h-3" /> Reset
        </button>
      )}

      {total !== undefined && (
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {total} test cases
        </span>
      )}
    </div>
  );
}
