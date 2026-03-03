/**
 * GeneratorContext — multi-job queue.
 *
 * - Each submit() call appends a new QueueItem and resets nothing in the form
 *   (form reset is the page's responsibility after calling submit).
 * - A single polling interval (2 s) fans out to all running jobs concurrently.
 * - Running jobs are persisted to localStorage (metadata only, no results)
 *   so a page refresh can resume polling.
 */
import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from "react";
import {
  generatorApi,
  type GenerationMode, type LLMProvider,
  type JobStatusResponse,
} from "@/lib/api";

const QUEUE_KEY = "autoqa_queue_v2";
const OLD_KEY   = "autoqa_active_job"; // legacy — clean up on mount

// ── Public types ──────────────────────────────────────────────────────────────

export interface GeneratorSubmitParams {
  requirement: string;
  mode: GenerationMode;
  language: string;
  providers: LLMProvider[];
}

export interface QueueItem {
  queueId: string;
  jobId: string | null;
  requirement: string;
  mode: GenerationMode;
  providers: LLMProvider[];
  language: string;
  /** "submitting" while the POST /generate request is in-flight */
  status: "submitting" | "running" | "success" | "failure" | "cancelled";
  progress: number;
  /** Full response from the last successful poll; null until first successful poll */
  lastPollResponse: JobStatusResponse | null;
  error: string | null;
  submittedAt: number;
}

interface GeneratorCtxValue {
  queue: QueueItem[];
  submit: (params: GeneratorSubmitParams) => Promise<void>;
  cancel: (queueId: string) => Promise<void>;
  dismiss: (queueId: string) => void;
  clearDone: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<GeneratorCtxValue | null>(null);

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Mirror queue into a ref so the interval closure always has the latest value
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // In-flight guard — prevents concurrent polls for the same jobId
  const inFlight = useRef(new Set<string>());

  // ── localStorage sync ────────────────────────────────────────────────────

  // Persist only the metadata of running jobs (no result payloads)
  useEffect(() => {
    const running = queue.filter(q => q.jobId && q.status === "running");
    if (running.length > 0) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(running.map(r => ({
        jobId: r.jobId!,
        mode: r.mode,
        requirement: r.requirement,
        providers: r.providers,
        language: r.language,
        queueId: r.queueId,
        submittedAt: r.submittedAt,
      }))));
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  }, [queue]);

  // On mount: restore running jobs + clean up legacy key
  useEffect(() => {
    localStorage.removeItem(OLD_KEY);

    const stored = localStorage.getItem(QUEUE_KEY);
    if (!stored) return;
    try {
      const jobs = JSON.parse(stored) as Array<{
        jobId: string; mode: GenerationMode; requirement: string;
        providers: LLMProvider[]; language: string; queueId: string;
        submittedAt: number;
      }>;
      if (!jobs.length) return;
      setQueue(jobs.map(j => ({
        queueId: j.queueId,
        jobId: j.jobId,
        requirement: j.requirement,
        mode: j.mode,
        providers: j.providers ?? [],
        language: j.language,
        status: "running",
        progress: 0,
        lastPollResponse: null,
        error: null,
        submittedAt: j.submittedAt ?? Date.now(),
      })));
    } catch {
      localStorage.removeItem(QUEUE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Single polling interval ───────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(async () => {
      const active = queueRef.current.filter(
        q => q.jobId && (q.status === "running") && !inFlight.current.has(q.jobId!)
      );
      if (!active.length) return;

      await Promise.all(active.map(async item => {
        const jobId = item.jobId!;
        inFlight.current.add(jobId);
        try {
          const status = await generatorApi.getJobStatus(jobId);
          setQueue(prev => {
            const qi = prev.find(q => q.queueId === item.queueId);
            if (!qi) return prev; // dismissed while poll was in-flight
            return prev.map(q => q.queueId !== item.queueId ? q : {
              ...q,
              progress: status.progress ?? q.progress,
              lastPollResponse: status,
              status: status.status === "success"   ? "success"
                    : status.status === "failure"   ? "failure"
                    : status.status === "cancelled" ? "cancelled"
                    : "running",
              error: (status.status === "failure" || status.status === "cancelled")
                    ? (status.error ?? (status.status === "cancelled" ? "Cancelled" : "Failed"))
                    : null,
            });
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // 404 means the backend job expired (server restart or 1-hour TTL)
          const expired = msg.includes("404") || msg.toLowerCase().includes("not found");
          setQueue(prev => {
            const qi = prev.find(q => q.queueId === item.queueId);
            if (!qi) return prev;
            return prev.map(q => q.queueId !== item.queueId ? q : {
              ...q,
              status: "failure",
              error: expired
                ? "Job expired — server may have restarted."
                : "Could not fetch job status.",
            });
          });
        } finally {
          inFlight.current.delete(jobId);
        }
      }));
    }, 2000);

    return () => clearInterval(id);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const submit = async (params: GeneratorSubmitParams): Promise<void> => {
    const queueId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

    // Add optimistically as "submitting"
    setQueue(q => [...q, {
      queueId,
      jobId: null,
      requirement: params.requirement,
      mode: params.mode,
      providers: params.providers,
      language: params.language,
      status: "submitting",
      progress: 0,
      lastPollResponse: null,
      error: null,
      submittedAt: Date.now(),
    }]);

    try {
      const submitted = await generatorApi.submit({
        requirement: params.requirement,
        mode: params.mode,
        language: params.language,
        providers: params.providers,
      });
      setQueue(q => q.map(qi => qi.queueId !== queueId ? qi : {
        ...qi, jobId: submitted.job_id, status: "running",
      }));
    } catch (err) {
      // Submission failed — mark the item as failure in-place (visible in queue)
      setQueue(q => q.map(qi => qi.queueId !== queueId ? qi : {
        ...qi,
        status: "failure",
        error: err instanceof Error ? err.message : "Submission failed",
      }));
    }
  };

  const dismiss = (queueId: string) => {
    setQueue(q => q.filter(qi => qi.queueId !== queueId));
  };

  const cancel = async (queueId: string): Promise<void> => {
    const item = queueRef.current.find(q => q.queueId === queueId);
    if (!item?.jobId) return;
    try {
      await generatorApi.cancelJob(item.jobId);
      // Optimistically mark as cancelled; the next poll will confirm
      setQueue(q => q.map(qi => qi.queueId !== queueId ? qi : {
        ...qi, status: "cancelled", error: "Cancelled by user",
      }));
    } catch {
      // Ignore errors — if it's already done, the next poll will update the status
    }
  };

  const clearDone = () => {
    setQueue(q => q.filter(qi => qi.status === "running" || qi.status === "submitting"));
  };

  return (
    <Ctx.Provider value={{ queue, submit, cancel, dismiss, clearDone }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGenerator() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGenerator must be used within GeneratorProvider");
  return ctx;
}
