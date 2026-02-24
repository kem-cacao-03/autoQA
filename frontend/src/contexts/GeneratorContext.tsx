/**
 * GeneratorContext — persists polling state above the router so navigation
 * never interrupts an in-progress job.
 *
 * - Polling continues regardless of which page the user is on.
 * - The active job_id is saved to localStorage so a page refresh can resume.
 */
import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from "react";
import {
  generatorApi,
  type GenerationMode, type LLMProvider, type TestType,
  type JobStatusResponse,
} from "@/lib/api";

const JOB_KEY = "autoqa_active_job";

export interface GeneratorSubmitParams {
  requirement: string;
  mode: GenerationMode;
  test_type: TestType;
  language: string;
  providers: LLMProvider[];
}

interface GeneratorCtxValue {
  jobStatus: JobStatusResponse | null;
  loading: boolean;
  error: string | null;
  /** Mode of the job that is currently running or was last completed. */
  jobMode: GenerationMode;
  submit: (params: GeneratorSubmitParams) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<GeneratorCtxValue | null>(null);

export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobMode, setJobMode] = useState<GenerationMode>("pipeline");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const status = await generatorApi.getJobStatus(jobId);
        setJobStatus(status);
        if (status.status === "success" || status.status === "failure") {
          stopPolling();
          setLoading(false);
          localStorage.removeItem(JOB_KEY);
        }
      } catch {
        stopPolling();
        setLoading(false);
        setError("Could not fetch job status.");
        localStorage.removeItem(JOB_KEY);
      }
    }, 2000);
  };

  // On mount: resume any job that was running before navigation / refresh
  useEffect(() => {
    const stored = localStorage.getItem(JOB_KEY);
    if (stored) {
      try {
        const { jobId, mode } = JSON.parse(stored) as { jobId: string; mode: GenerationMode };
        setJobMode(mode ?? "pipeline");
        setLoading(true);
        startPolling(jobId);
      } catch {
        localStorage.removeItem(JOB_KEY);
      }
    }
    return stopPolling;
  // startPolling is stable (only uses refs + state setters)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (params: GeneratorSubmitParams) => {
    stopPolling();
    setError(null);
    setJobStatus(null);
    setLoading(true);
    setJobMode(params.mode);
    try {
      const submitted = await generatorApi.submit({
        requirement: params.requirement,
        mode: params.mode,
        test_type: params.test_type,
        language: params.language,
        providers: params.providers,
      });
      localStorage.setItem(JOB_KEY, JSON.stringify({ jobId: submitted.job_id, mode: params.mode }));
      startPolling(submitted.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setLoading(false);
    }
  };

  const reset = () => {
    stopPolling();
    setJobStatus(null);
    setLoading(false);
    setError(null);
    localStorage.removeItem(JOB_KEY);
  };

  return (
    <Ctx.Provider value={{ jobStatus, loading, error, jobMode, submit, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGenerator() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGenerator must be used within GeneratorProvider");
  return ctx;
}
