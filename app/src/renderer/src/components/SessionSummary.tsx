import { cn } from "@/lib/utils";
import type { SessionSummaryReadyPayload } from "../../../shared/ipc";
import { StatusBar } from "./StatusBar";
import { CategoryBreakdown } from "./CategoryBreakdown";

interface Props {
  data: SessionSummaryReadyPayload;
  onDone: () => void;
}

export function SessionSummary({ data, onDone }: Props): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-6 rounded-lg bg-card p-8 text-card-foreground shadow-md">
        <h1 className="text-xl font-semibold">Here's how it went</h1>

        <div className="space-y-1">
          <h2 className="text-sm font-medium">{data.task}</h2>
        </div>

        <StatusBar
          onTaskSeconds={data.onTaskSeconds}
          distractedSeconds={data.distractedSeconds}
          ambiguousSeconds={data.ambiguousSeconds}
        />

        <CategoryBreakdown categories={data.categoryBreakdown} />

        <button
          className={cn(
            "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
            "hover:bg-primary/90",
          )}
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  );
}
