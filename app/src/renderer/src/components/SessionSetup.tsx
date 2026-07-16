import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  task: string;
  onTaskChange: (value: string) => void;
  distractions: string;
  onDistractionsChange: (value: string) => void;
  approved: string;
  onApprovedChange: (value: string) => void;
  onStarted: (sessionId: string, startedAt: string) => void;
  onViewPast: () => void;
  onCustomizeMascot: () => void;
}

export function SessionSetup({
  task,
  onTaskChange,
  distractions,
  onDistractionsChange,
  approved,
  onApprovedChange,
  onStarted,
  onViewPast,
  onCustomizeMascot,
}: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart =
    task.trim().length > 0 &&
    distractions.trim().length > 0 &&
    approved.trim().length > 0;

  const handleStart = async (): Promise<void> => {
    if (!canStart) return;
    setLoading(true);
    setError(null);
    try {
      const distractionList = distractions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const approvedList = approved
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { sessionId, startedAt } = await window.api.session.start({
        task: task.trim(),
        distractionList,
        approvedList,
      });
      onTaskChange("");
      onDistractionsChange("");
      onApprovedChange("");
      onStarted(sessionId, startedAt);
    } catch (err) {
      setError("Failed to start session. Check the app logs.");
      console.error("[SessionSetup] session:start failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-card p-8 text-card-foreground shadow-md">
        <h1 className="text-xl font-semibold">What are you working on?</h1>

        <div className="space-y-2">
          <textarea
            className={cn(
              "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            )}
            rows={3}
            placeholder="Describe your task…"
            value={task}
            onChange={(e) => onTaskChange(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Distraction keywords{" "}
            <span className="text-xs">(comma-separated)</span>
          </label>
          <input
            type="text"
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            )}
            placeholder="youtube, reddit, twitter"
            value={distractions}
            onChange={(e) => onDistractionsChange(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Approved keywords/sites{" "}
            <span className="text-xs">(comma-separated)</span>
          </label>
          <input
            type="text"
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            )}
            placeholder="docs.python.org, linear.app, figma"
            value={approved}
            onChange={(e) => onApprovedChange(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {error !== null && <p className="text-sm text-destructive">{error}</p>}

        <button
          className={cn(
            "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
          )}
          disabled={!canStart || loading}
          onClick={() => void handleStart()}
        >
          {loading ? "Starting…" : "Start Session"}
        </button>

        <div className="flex justify-center gap-4">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onViewPast}
            disabled={loading}
          >
            View past sessions
          </button>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onCustomizeMascot}
            disabled={loading}
          >
            Customize mascot
          </button>
        </div>
      </div>
    </div>
  );
}
