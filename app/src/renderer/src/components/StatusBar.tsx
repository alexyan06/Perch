import { cn } from "@/lib/utils";
import { formatDuration } from "../mascot-messages";

interface Props {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
}

interface Segment {
  key: string;
  label: string;
  seconds: number;
  colorClass: string;
}

// Status colors (good/critical/warning), not arbitrary categorical hues —
// this is a 3-way split where the categories mean good/bad/neutral, not
// unordered identities. Per the dataviz skill, that calls for a single
// horizontal stacked bar, not a pie chart.
export function StatusBar({
  onTaskSeconds,
  distractedSeconds,
  ambiguousSeconds,
}: Props): React.JSX.Element {
  const total = onTaskSeconds + distractedSeconds + ambiguousSeconds;

  const segments: Segment[] = [
    {
      key: "onTask",
      label: "On-task",
      seconds: onTaskSeconds,
      colorClass: "bg-success",
    },
    {
      key: "distracted",
      label: "Distracted",
      seconds: distractedSeconds,
      colorClass: "bg-destructive",
    },
    {
      key: "ambiguous",
      label: "Ambiguous",
      seconds: ambiguousSeconds,
      colorClass: "bg-warning",
    },
  ].filter((s) => s.seconds > 0);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div
            key={s.key}
            className={cn("h-full", s.colorClass)}
            style={{ width: `${(s.seconds / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span className={cn("h-2 w-2 rounded-full", s.colorClass)} />
            <span>
              {s.label}: {formatDuration(s.seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
