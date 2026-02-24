import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

const PRIORITY_CONFIG: Record<string, { badge: string; dot: string; border: string }> = {
  High: { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", dot: "bg-rose-500", border: "border-l-rose-400" },
  Medium: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", dot: "bg-amber-500", border: "border-l-amber-400" },
  Low: { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500", border: "border-l-emerald-400" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function TestCaseCard({ tc, index }: { tc: Record<string, unknown>; index: number }) {
  const [open, setOpen] = useState(false);

  const id = String(tc.test_case_id ?? tc.id ?? `TC-${index + 1}`);
  const title = String(tc.title ?? "Untitled");
  const priority = String(tc.priority ?? "Medium");
  const category = String(tc.category ?? "");
  const cfg = PRIORITY_CONFIG[priority] ?? { badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400", border: "border-l-slate-300" };

  const preconditions: string[] = Array.isArray(tc.preconditions)
    ? (tc.preconditions as unknown[]).map((p) => String(p))
    : [];

  const steps: string[] = Array.isArray(tc.steps)
    ? (tc.steps as unknown[]).map((s) => String(s))
    : [];

  const expectedResult = tc.expected_result ?? tc.expected_outcome;
  const expectedStr = expectedResult != null
    ? (typeof expectedResult === "string" ? expectedResult : JSON.stringify(expectedResult))
    : null;

  const testData = (
    tc.test_data != null &&
    typeof tc.test_data === "object" &&
    !Array.isArray(tc.test_data) &&
    Object.keys(tc.test_data as object).length > 0
  ) ? tc.test_data : null;

  return (
    <div className={`group/card border border-slate-100 dark:border-slate-700/80 border-l-4 ${cfg.border} rounded-xl overflow-hidden hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-200 bg-white dark:bg-slate-800/50`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Priority dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

        {/* ID — fixed width, truncate long IDs */}
        <span className="text-xs font-mono text-slate-400 dark:text-slate-500 w-28 shrink-0 truncate" title={id}>{id}</span>

        {/* Title — min-w-0 ensures truncate works */}
        <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{title}</span>

        {/* Priority badge */}
        <span className={`badge shrink-0 ${cfg.badge}`}>{priority}</span>

        {/* Category badge */}
        {category && (
          <span className="badge shrink-0 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 border border-brand-100 dark:border-brand-800/30">
            {category}
          </span>
        )}

        <CopyButton text={`${id}: ${title}`} />

        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 space-y-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-700/50 animate-fade-in">

          {preconditions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Preconditions</p>
              <ul className="space-y-1">
                {preconditions.map((p, i) => (
                  <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2.5 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0 block" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Steps</p>
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-3 items-start">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {expectedStr != null && (
            <div className="bg-emerald-50/70 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1.5">Expected Result</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{expectedStr}</p>
            </div>
          )}

          {testData != null && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Test Data</p>
              <pre className="text-xs font-mono bg-slate-900 dark:bg-slate-950 text-emerald-400 rounded-xl p-3.5 overflow-auto border border-slate-800">
                {JSON.stringify(testData, null, 2)}
              </pre>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
