import type { CategoryDuration } from "../../../shared/ipc";
import { formatDuration } from "../../../shared/mascot-messages";

interface Props {
  categories: CategoryDuration[];
}

// One measure (seconds) across many named, unordered categories — per the
// dataviz skill's color formula this is nominal categorical with a single
// series, so every bar takes the same one hue (identity already comes from
// the label, not the color) rather than a different color per app/site.
export function CategoryBreakdown({
  categories,
}: Props): React.JSX.Element | null {
  if (categories.length === 0) return null;
  const max = Math.max(...categories.map((c) => c.seconds));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Time by app &amp; site
      </p>
      <div className="space-y-1.5">
        {categories.map((c) => (
          <div key={c.label} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground">{c.label}</span>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDuration(c.seconds)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${max > 0 ? (c.seconds / max) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
