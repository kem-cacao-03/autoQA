import { useState, useEffect, type FormEvent } from "react";
import {
  Zap, FlaskConical,
  Clock, Cpu, CheckCircle, XCircle,
  Loader2, FileJson, FileSpreadsheet,
  Globe, Sparkles, X, ListChecks, Square,
} from "lucide-react";
import {
  type GenerationMode, type LLMProvider,
  type ResearchProviderResult, type StageUsage,
} from "@/lib/api";
import { useGenerator, type QueueItem } from "@/contexts/GeneratorContext";
import { TestCaseCard } from "@/components/TestCaseCard";
import { FilenameDialog } from "@/components/FilenameDialog";
import { ProviderLogo } from "@/components/ProviderLogo";
import { SortBar, sortCases, filterCases, getCategories, toggleSort, type SortState } from "@/components/SortBar";
import { downloadJSON, downloadExcel } from "@/lib/export";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  openai: "GPT-4o",
  gemini: "Gemini",
  claude: "Claude",
};

const PROVIDER_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  openai: { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-300" },
  gemini: { bg: "bg-blue-500",    text: "text-white", ring: "ring-blue-300"    },
  claude: { bg: "bg-violet-500",  text: "text-white", ring: "ring-violet-300"  },
  ba:       { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-300" },
  qa:       { bg: "bg-blue-500",    text: "text-white", ring: "ring-blue-300"    },
  reviewer: { bg: "bg-violet-500",  text: "text-white", ring: "ring-violet-300"  },
};

const PIPELINE_STEPS = [
  { key: "ba",       label: "Business Analyst", model: "GPT-4o",  icon: "BA" },
  { key: "qa",       label: "QA Engineer",       model: "Gemini",  icon: "QA" },
  { key: "reviewer", label: "Quality Auditor",   model: "Claude",  icon: "CR" },
];

const STAGE_INFO: Record<string, { model: string; role: string; color: string }> = {
  ba:       { model: "GPT-4o",  role: "Business Analyst", color: "bg-emerald-500" },
  qa:       { model: "Gemini",  role: "QA Engineer",      color: "bg-blue-500"    },
  reviewer: { model: "Claude",  role: "Quality Auditor",  color: "bg-violet-500"  },
  openai:   { model: "GPT-4o",  role: "Research",         color: "bg-emerald-500" },
  gemini:   { model: "Gemini",  role: "Research",         color: "bg-blue-500"    },
  claude:   { model: "Claude",  role: "Research",         color: "bg-violet-500"  },
};

interface DashRow {
  key: string; model: string; role: string; color: string;
  prompt: number; completion: number; total: number; duration: number | undefined;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-brand-500 via-violet-500 to-brand-400 rounded-full transition-all duration-700"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function PipelineStepIndicator({ progress }: { progress: number }) {
  const activeIndex = progress < 35 ? 0 : progress < 70 ? 1 : 2;
  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STEPS.map((step, i) => {
        const done   = i < activeIndex;
        const active = i === activeIndex;
        const styles = PROVIDER_STYLES[step.key];
        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className={`h-px w-8 sm:w-12 transition-all duration-500 ${done ? "bg-brand-400" : "bg-slate-200 dark:bg-slate-700"}`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ring-2 ring-offset-2 dark:ring-offset-slate-900 ${
                done   ? `${styles.bg} ${styles.text} ${styles.ring} opacity-60` :
                active ? `${styles.bg} ${styles.text} ${styles.ring} shadow-lg animate-pulse` :
                         "bg-slate-100 dark:bg-slate-700 text-slate-400 ring-transparent"
              }`}>
                {done ? <CheckCircle className="w-4 h-4" /> : step.icon}
              </div>
              <div className="text-center">
                <p className={`text-[10px] font-semibold ${active ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500"}`}>
                  {step.model}
                </p>
                <p className={`text-[9px] hidden sm:block ${active ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600"}`}>
                  {step.label}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UsageDashboard({
  usage, elapsed, mode, researchResults,
}: {
  usage?: StageUsage[];
  elapsed?: number;
  mode: GenerationMode;
  researchResults?: ResearchProviderResult[];
}) {
  const rows: DashRow[] = [];

  if (mode === "pipeline" && usage?.length) {
    for (const u of usage) {
      const info = STAGE_INFO[u.stage] ?? { model: u.stage, role: "", color: "bg-slate-400" };
      rows.push({ key: u.stage, model: info.model, role: info.role, color: info.color, prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens, duration: u.duration_seconds });
    }
  } else if (mode === "research" && researchResults?.length) {
    for (const r of researchResults) {
      if (!r.usage) continue;
      const u    = r.usage;
      const info = STAGE_INFO[r.provider] ?? { model: r.provider, role: "Research", color: "bg-slate-400" };
      rows.push({ key: r.provider, model: info.model, role: info.role, color: info.color, prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens, duration: u.duration_seconds });
    }
  }

  if (!rows.length && elapsed == null) return null;

  const totalTokens = rows.reduce((s, r) => s + r.total, 0);
  const maxTokens   = rows.length > 0 ? Math.max(...rows.map((r) => r.total)) : 1;

  return (
    <div className="card p-5 animate-fade-in space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-brand-500" /> Usage Dashboard
      </h3>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{totalTokens.toLocaleString()}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tokens</p>
            </div>
            <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-sky-600 dark:text-sky-400 flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" />
                {elapsed != null ? `${elapsed.toFixed(1)}s` : "—"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total time</p>
            </div>
            <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-brand-600 dark:text-brand-400">{rows.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Models</p>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-24 shrink-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{row.model}</span>
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                  <div className={`h-full ${row.color} rounded-full opacity-80 transition-all duration-700`} style={{ width: `${(row.total / maxTokens) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 w-24 text-right shrink-0 tabular-nums">
                  {row.total.toLocaleString()} tok
                </span>
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 w-14 text-right shrink-0 tabular-nums">
                  {row.duration != null ? `${row.duration.toFixed(1)}s` : "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Queue panel ────────────────────────────────────────────────────────────────

function QueueItemRow({
  item, onDismiss, onCancel,
}: {
  item: QueueItem;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const isActive    = item.status === "submitting" || item.status === "running";
  const isDone      = item.status === "success" || item.status === "failure" || item.status === "cancelled";
  const isCancelled = item.status === "cancelled";
  const truncReq    = item.requirement.length > 110
    ? item.requirement.slice(0, 110) + "…"
    : item.requirement;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        {isActive
          ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          : item.status === "success"
            ? <CheckCircle className="w-4 h-4 text-emerald-500" />
            : isCancelled
              ? <Square className="w-4 h-4 text-slate-400" />
              : <XCircle className="w-4 h-4 text-rose-500" />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed flex-1 min-w-0">
            {truncReq}
          </span>
          <span className={`badge shrink-0 ${
            item.mode === "pipeline"
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-100 dark:border-brand-800/30"
              : "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-100 dark:border-violet-800/30"
          }`}>
            {item.mode === "pipeline" ? "Standard" : "Research"}
          </span>
        </div>

        {/* Running state */}
        {item.status === "submitting" && (
          <p className="text-[11px] text-slate-400">Submitting…</p>
        )}
        {item.status === "running" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              {item.mode === "pipeline" && item.progress > 0 && (
                <PipelineStepIndicator progress={item.progress} />
              )}
              {item.progress > 0 && (
                <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 tabular-nums ml-auto shrink-0">
                  {item.progress}%
                </span>
              )}
            </div>
            {item.progress > 0 && <ProgressBar value={item.progress} />}
          </div>
        )}

        {/* Cancelled message */}
        {isCancelled && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Cancelled</p>
        )}

        {/* Failure message */}
        {item.status === "failure" && item.error && (
          <p className="text-[11px] text-rose-500 dark:text-rose-400 line-clamp-2">{item.error}</p>
        )}

        {/* Success summary */}
        {item.status === "success" && item.lastPollResponse?.result && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            {item.lastPollResponse.result.total_count} test cases generated
          </p>
        )}
      </div>

      {/* Cancel button for running items */}
      {item.status === "running" && (
        <button
          onClick={onCancel}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-rose-200 text-rose-400 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:border-rose-800/50 dark:text-rose-500/70 dark:hover:border-rose-600 dark:hover:text-rose-400 dark:hover:bg-rose-900/20 transition-all duration-150"
          title="Stop this job"
        >
          <Square className="w-3 h-3 fill-current" />
          Stop
        </button>
      )}

      {/* Dismiss button for completed items */}
      {isDone && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function QueuePanel({ queue, dismiss, cancel, clearDone }: {
  queue: QueueItem[];
  dismiss: (id: string) => void;
  cancel: (id: string) => void;
  clearDone: () => void;
}) {
  const runningCount = queue.filter(q => q.status === "running" || q.status === "submitting").length;
  const doneCount    = queue.filter(q => q.status === "success" || q.status === "failure" || q.status === "cancelled").length;

  return (
    <div className="card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Queue</span>
          {runningCount > 0 && (
            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-100 dark:border-brand-800/30 animate-pulse">
              {runningCount} running
            </span>
          )}
        </div>
        {doneCount > 0 && (
          <button
            onClick={clearDone}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Clear done
          </button>
        )}
      </div>

      {/* Items — newest first */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
        {[...queue].reverse().map(item => (
          <QueueItemRow
            key={item.queueId}
            item={item}
            onDismiss={() => dismiss(item.queueId)}
            onCancel={() => cancel(item.queueId)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GeneratorPage() {
  const { queue, submit, cancel, dismiss, clearDone } = useGenerator();

  // ── Form state (fully local — resets after each submit) ──────────────────
  const [mode, setMode]             = useState<GenerationMode>("pipeline");
  const [providers, setProviders]   = useState<Set<LLMProvider>>(
    () => new Set(["openai", "gemini", "claude"] as LLMProvider[])
  );
  const [requirement, setRequirement] = useState("");
  const [language, setLanguage]       = useState("Vietnamese");
  const [activeTab, setActiveTab]     = useState<string>("openai");

  // ── Derive active result from queue ─────────────────────────────────────
  // Show the most recently submitted job that succeeded
  const latestSuccess = [...queue].reverse().find(q => q.status === "success") ?? null;
  const jobStatus     = latestSuccess?.lastPollResponse ?? null;
  const jobMode       = latestSuccess?.mode ?? "pipeline";
  const hasResult     = !!latestSuccess;
  const researchResults = jobStatus?.research_results;

  // Auto-select first research tab when results arrive
  useEffect(() => {
    if (researchResults?.length) setActiveTab(researchResults[0].provider);
  }, [researchResults]);

  // ── Sort / filter ─────────────────────────────────────────────────────────
  const [sort, setSort]                 = useState<SortState | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cardGen, setCardGen]           = useState(0);

  // Reset category filter + collapse cards when switching research tabs
  useEffect(() => { setCategoryFilter(null); setCardGen((g) => g + 1); }, [activeTab]);

  // ── Derived values ────────────────────────────────────────────────────────
  const pipelineResult    = jobStatus?.result;
  const rawItems          = pipelineResult ? (pipelineResult.test_cases ?? []) : [];
  const pipelineCategories = getCategories(rawItems as Record<string, unknown>[]);
  const items             = sortCases(filterCases(rawItems as Record<string, unknown>[], categoryFilter), sort) as typeof rawItems;

  // ── Export dialog ─────────────────────────────────────────────────────────
  const [exportDialog, setExportDialog] = useState<{ type: "json" | "excel"; name: string } | null>(null);

  const openExportDialog = (type: "json" | "excel") => {
    if (!latestSuccess) return;
    let name: string;
    if (jobMode === "research" && researchResults?.length) {
      const providerNames = researchResults
        .map((r) => PROVIDER_LABELS[r.provider as LLMProvider] ?? r.provider)
        .join("_");
      name = `TestSuite_Research_${providerNames}`;
    } else {
      name = "TestSuite_Standard";
    }
    setExportDialog({ type, name });
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleProvider = (p: LLMProvider) => {
    setProviders((prev) => {
      const next = new Set(prev);
      if (next.has(p)) { if (next.size > 1) next.delete(p); }
      else next.add(p);
      return next;
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = { requirement, mode, language, providers: Array.from(providers) };
    // Reset form immediately — submit is fire-and-forget
    setRequirement("");
    submit(params);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-violet-600 p-8 text-white shadow-xl shadow-brand-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15)_0%,transparent_60%)]" />
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute -left-4 -bottom-4 w-32 h-32 rounded-full bg-violet-500/20 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 text-xs font-medium mb-4">
            <Sparkles className="w-3 h-3" /> AI-Powered Test Generation
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Generate Test Cases</h1>
          <p className="text-brand-100 text-sm max-w-lg leading-relaxed">
            Describe your requirements — our 3-stage AI pipeline (GPT-4o → Gemini → Claude) generates a complete, verified test suite.
          </p>
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            {PIPELINE_STEPS.map((step, i) => {
              const styles = PROVIDER_STYLES[step.key];
              return (
                <span key={step.key} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-white/30 text-xs">→</span>}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 border border-white/20">
                    <span className={`w-2 h-2 rounded-full ${styles.bg}`} />
                    {step.model}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Mode switch */}
        <div className="card p-1 inline-flex gap-1">
          {(["pipeline", "research"] as GenerationMode[]).map((m) => (
            <button
              key={m} type="button" onClick={() => setMode(m)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer select-none transition-all duration-200 ${mode === m
                ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-500/20"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              {m === "pipeline" ? <Zap className="w-3.5 h-3.5" /> : <FlaskConical className="w-3.5 h-3.5" />}
              {m === "pipeline" ? "Standard" : "Research"}
            </button>
          ))}
        </div>

        {/* Research providers */}
        {mode === "research" && (
          <div className="card p-5 animate-fade-in">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Select models
            </label>
            <div className="flex flex-wrap gap-3">
              {(["openai", "gemini", "claude"] as LLMProvider[]).map((p) => {
                const providerConfig: Record<string, { selectedBg: string; selectedBorder: string; selectedText: string; iconBg: string; checkColor: string }> = {
                  openai: { selectedBg: "bg-emerald-50 dark:bg-emerald-900/20", selectedBorder: "border-emerald-400 dark:border-emerald-600", selectedText: "text-emerald-700 dark:text-emerald-400", iconBg: "bg-emerald-500", checkColor: "text-emerald-500" },
                  gemini: { selectedBg: "bg-blue-50 dark:bg-blue-900/20",       selectedBorder: "border-blue-400 dark:border-blue-600",       selectedText: "text-blue-700 dark:text-blue-400",       iconBg: "bg-blue-500",    checkColor: "text-blue-500"    },
                  claude: { selectedBg: "bg-violet-50 dark:bg-violet-900/20",   selectedBorder: "border-violet-400 dark:border-violet-600",   selectedText: "text-violet-700 dark:text-violet-400",   iconBg: "bg-violet-500",  checkColor: "text-violet-500"  },
                };
                const cfg  = providerConfig[p];
                const isOn = providers.has(p);
                return (
                  <label key={p} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none ${isOn
                    ? `${cfg.selectedBg} ${cfg.selectedBorder} shadow-sm`
                    : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500"
                  }`}>
                    <input type="checkbox" className="sr-only" checked={isOn} onChange={() => toggleProvider(p)} />
                    <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} flex items-center justify-center shadow-sm shrink-0`}>
                      <ProviderLogo provider={p} className="w-4 h-4 text-white" />
                    </div>
                    <p className={`text-sm font-semibold ${isOn ? cfg.selectedText : "text-slate-700 dark:text-slate-300"}`}>
                      {PROVIDER_LABELS[p]}
                    </p>
                    {isOn && <CheckCircle className={`w-4 h-4 ml-auto shrink-0 ${cfg.checkColor}`} />}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Main form card */}
        <div className="card p-6 space-y-5">
          {/* Requirement textarea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Requirement <span className="text-rose-500">*</span>
              </label>
              <span className={`text-xs tabular-nums ${requirement.length > 0 ? "text-brand-500" : "text-slate-400"}`}>
                {requirement.length} chars
              </span>
            </div>
            <textarea
              rows={7} required minLength={10}
              className="input resize-none text-sm leading-relaxed"
              placeholder={"Describe your testing requirements in natural language\n\nExample: The login feature should accept a valid email and password. The system must validate the email format, enforce a minimum password length of 8 characters, and display clear error messages when credentials are invalid."}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
            />
          </div>

          {/* Language select */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              <Globe className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
              Output Language
            </label>
            <select className="input pr-8" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="Vietnamese">Vietnamese</option>
              <option value="English">English</option>
            </select>
          </div>

          {/* Submit */}
          <button type="submit" className="btn-primary w-full py-3.5 text-base">
            <Zap className="w-5 h-5" /> Generate Test Cases
          </button>
        </div>
      </form>

      {/* ── Queue panel ── */}
      {queue.length > 0 && (
        <QueuePanel queue={queue} dismiss={dismiss} cancel={cancel} clearDone={clearDone} />
      )}

      {/* ── Results ── */}
      {hasResult && (
        <div className="space-y-5 animate-slide-up">
          {/* Success header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {pipelineResult?.test_suite_name ?? "Research Results"}
                </h2>
                {pipelineResult && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {pipelineResult.total_count} test cases generated
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-xs" onClick={() => openExportDialog("json")}>
                <FileJson className="w-3.5 h-3.5" /> JSON
              </button>
              <button className="btn-secondary text-xs" onClick={() => openExportDialog("excel")}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
            </div>
          </div>

          {/* Usage dashboard */}
          <UsageDashboard
            usage={jobStatus?.usage}
            elapsed={jobStatus?.elapsed_seconds}
            mode={jobMode}
            researchResults={researchResults}
          />

          {/* Pipeline test cases */}
          {jobMode === "pipeline" && items.length > 0 && (
            <div className="space-y-3">
              <SortBar
                sort={sort}
                onToggle={(k) => { setSort((p) => toggleSort(p, k)); setCardGen((g) => g + 1); }}
                onReset={() => { setSort(null); setCategoryFilter(null); setCardGen((g) => g + 1); }}
                categories={pipelineCategories}
                categoryFilter={categoryFilter}
                onCategoryFilter={(cat) => { setCategoryFilter(cat); setCardGen((g) => g + 1); }}
                total={items.length}
              />
              <div className="space-y-2">
                {items.map((tc, i) => (
                  <TestCaseCard key={`${i}-${cardGen}`} tc={tc as Record<string, unknown>} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Research tabs */}
          {jobMode === "research" && researchResults && (
            <div className="card overflow-hidden">
              <div className="flex border-b border-slate-100 dark:border-slate-700 px-3 pt-3 gap-1">
                {researchResults.map((r) => {
                  const styles = PROVIDER_STYLES[r.provider] ?? { bg: "bg-slate-400", text: "text-white", ring: "ring-slate-300" };
                  return (
                    <button
                      key={r.provider}
                      onClick={() => setActiveTab(r.provider)}
                      className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-200 flex items-center gap-2 cursor-pointer select-none border-b-2 -mb-px ${activeTab === r.provider
                        ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/10"
                        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${styles.bg}`} />
                      {PROVIDER_LABELS[r.provider as LLMProvider] ?? r.provider}
                      {r.result && (
                        <span className="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ml-1">
                          {r.result.total_count}
                        </span>
                      )}
                      {r.success
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        : <XCircle    className="w-3.5 h-3.5 text-rose-500" />
                      }
                    </button>
                  );
                })}
              </div>
              {researchResults.filter((r) => r.provider === activeTab).map((r) => (
                <div key={r.provider} className="p-4 space-y-3 animate-fade-in">
                  {r.success && r.result ? (
                    <>
                      {(() => {
                        const tabCategories = getCategories(r.result.test_cases as Record<string, unknown>[]);
                        const tabItems      = sortCases(filterCases(r.result.test_cases as Record<string, unknown>[], categoryFilter), sort);
                        return (
                          <>
                            <SortBar
                              sort={sort}
                              onToggle={(k) => { setSort((p) => toggleSort(p, k)); setCardGen((g) => g + 1); }}
                              onReset={() => { setSort(null); setCategoryFilter(null); setCardGen((g) => g + 1); }}
                              categories={tabCategories}
                              categoryFilter={categoryFilter}
                              onCategoryFilter={(cat) => { setCategoryFilter(cat); setCardGen((g) => g + 1); }}
                              total={tabItems.length}
                            />
                            <div className="space-y-2">
                              {tabItems.map((tc, i) => (
                                <TestCaseCard key={`${i}-${cardGen}`} tc={tc as Record<string, unknown>} index={i} />
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400 py-6 justify-center">
                      <XCircle className="w-5 h-5" />
                      <span className="text-sm">{r.error ?? "Provider failed"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {exportDialog && (
        <FilenameDialog
          defaultName={exportDialog.name}
          extension={exportDialog.type === "json" ? "json" : "xlsx"}
          onConfirm={(filename) => {
            if (exportDialog.type === "json") downloadJSON(pipelineResult, researchResults, filename);
            else downloadExcel(pipelineResult, researchResults, filename);
          }}
          onClose={() => setExportDialog(null)}
        />
      )}
    </div>
  );
}
