import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ClassificationTickPayload } from "../../../shared/ipc";

type Classification = ClassificationTickPayload["classification"] | null;

function statusLabel(c: Classification): string {
  if (c === null) return "Starting…";
  if (c === "on_task") return "On task";
  if (c === "distraction") return "Distraction detected";
  return "Monitoring…";
}

interface Props {
  sessionId: string;
  startedAt: string;
  onEnded: () => void;
}

function useElapsed(startedAt: string): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = (): void => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function SessionActive({
  sessionId,
  startedAt,
  onEnded,
}: Props): React.JSX.Element {
  const elapsed = useElapsed(startedAt);
  const [loading, setLoading] = useState(false);
  const [classification, setClassification] = useState<Classification>(null);

  useEffect(() => {
    const unsub = window.api.classification.onTick((payload) => {
      if (payload.sessionId === sessionId) {
        setClassification(payload.classification);
      }
    });
    return unsub;
  }, [sessionId]);

  const handleEnd = async (): Promise<void> => {
    setLoading(true);
    try {
      await window.api.session.end({ sessionId });
    } catch (err) {
      console.error("[SessionActive] session:end failed:", err);
    } finally {
      setLoading(false);
      onEnded();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-xs space-y-4 rounded-lg bg-card p-6 text-card-foreground shadow-sm">
        <div className="text-center">
          <p className="text-4xl font-mono font-light tabular-nums">
            {elapsed}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabel(classification)}
          </p>
        </div>

        <button
          className={cn(
            "w-full rounded-md border border-input bg-background px-4 py-2 text-sm text-muted-foreground",
            "hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
          disabled={loading}
          onClick={() => void handleEnd()}
        >
          {loading ? "Ending…" : "End Session"}
        </button>
      </div>
    </div>
  );
}
