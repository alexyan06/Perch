import { useEffect, useState } from "react";
import type {
  PastSession,
  SessionGetTrendsResponse,
} from "../../../shared/ipc";
import { StatusBar } from "./StatusBar";
import { CategoryBreakdown } from "./CategoryBreakdown";

interface Props {
  onBack: () => void;
}

const TRENDS_DAYS = 7;

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PastSessions({ onBack }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<PastSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trends, setTrends] = useState<SessionGetTrendsResponse | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.session
      .getPast({ limit: 20 })
      .then((res) => {
        if (!cancelled) setSessions(res.sessions);
      })
      .catch((err: unknown) => {
        console.error("[PastSessions] session:getPast failed:", err);
        if (!cancelled) setError("Couldn't load past sessions right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetched independently from the session list — a trends failure
  // shouldn't block the list from showing, and vice versa.
  useEffect(() => {
    let cancelled = false;
    window.api.session
      .getTrends({ days: TRENDS_DAYS })
      .then((res) => {
        if (!cancelled) setTrends(res);
      })
      .catch((err: unknown) => {
        console.error("[PastSessions] session:getTrends failed:", err);
        if (!cancelled) setTrendsError("Couldn't load trends right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (sessionId: string): Promise<void> => {
    if (!window.confirm("Delete this session? This can't be undone.")) {
      return;
    }
    setBusyId(sessionId);
    setError(null);
    try {
      await window.api.session.delete({ sessionId });
      setSessions((prev) => prev?.filter((s) => s.id !== sessionId) ?? null);
    } catch (err) {
      console.error("[PastSessions] session:delete failed:", err);
      setError("Couldn't delete that session right now.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-background py-12">
      <div className="w-full max-w-lg space-y-6 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Past sessions</h1>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            Back
          </button>
        </div>

        {trendsError !== null && (
          <p className="text-sm text-destructive">{trendsError}</p>
        )}
        {trends !== null && trends.sessionCount > 0 && (
          <div className="space-y-3 rounded-lg bg-card p-6 text-card-foreground shadow-sm">
            <h2 className="text-sm font-medium">
              Last {TRENDS_DAYS} days · {trends.sessionCount} session
              {trends.sessionCount === 1 ? "" : "s"}
            </h2>
            <StatusBar
              onTaskSeconds={trends.onTaskSeconds}
              distractedSeconds={trends.distractedSeconds}
              ambiguousSeconds={trends.ambiguousSeconds}
            />
            <CategoryBreakdown categories={trends.categoryBreakdown} />
          </div>
        )}

        {error !== null && <p className="text-sm text-destructive">{error}</p>}

        {error === null && sessions === null && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {sessions !== null && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sessions yet — start one to see it here.
          </p>
        )}

        <div className="space-y-4">
          {sessions?.map((s) => (
            <div
              key={s.id}
              className="space-y-3 rounded-lg bg-card p-6 text-card-foreground shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-sm font-medium">{s.task}</h2>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatSessionDate(s.startedAt)}
                  </span>
                  <button
                    className="text-xs text-muted-foreground underline hover:text-destructive disabled:opacity-50"
                    onClick={() => void handleDelete(s.id)}
                    disabled={busyId !== null}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {s.onTaskSeconds !== undefined ? (
                <>
                  <StatusBar
                    onTaskSeconds={s.onTaskSeconds}
                    distractedSeconds={s.distractedSeconds ?? 0}
                    ambiguousSeconds={s.ambiguousSeconds ?? 0}
                  />
                  {s.categoryBreakdown !== undefined && (
                    <CategoryBreakdown categories={s.categoryBreakdown} />
                  )}
                </>
              ) : (
                // Legacy session, created before the stats-based summary —
                // keep showing its real AI-written summary rather than
                // hiding data that already exists.
                <>
                  {s.summary !== undefined && s.summary.length > 0 && (
                    <p className="text-sm text-muted-foreground">{s.summary}</p>
                  )}
                  {s.nextSteps !== undefined && s.nextSteps.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Next steps
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                        {s.nextSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
