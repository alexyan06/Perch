import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MascotListEntry } from "../../../shared/ipc";

interface Props {
  onBack: () => void;
  onCreateNew: () => void;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function MascotLibrary({
  onBack,
  onCreateNew,
}: Props): React.JSX.Element {
  const [mascots, setMascots] = useState<MascotListEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "default" or a mascot id — whichever select/delete call is in flight.
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const res = await window.api.mascot.list();
      setMascots(res.mascots);
      setSelectedId(res.selectedId);
    } catch (err) {
      console.error("[MascotLibrary] mascot:list failed:", err);
      setError("Couldn't load your saved mascots right now.");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleSelect = async (id: string | null): Promise<void> => {
    setBusyId(id ?? "default");
    setError(null);
    try {
      await window.api.mascot.select({ id });
      setSelectedId(id);
    } catch (err) {
      console.error("[MascotLibrary] mascot:select failed:", err);
      setError("Couldn't switch mascots right now.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm("Delete this mascot? This can't be undone.")) return;
    setBusyId(id);
    setError(null);
    try {
      await window.api.mascot.delete({ id });
      await refresh();
    } catch (err) {
      console.error("[MascotLibrary] mascot:delete failed:", err);
      setError("Couldn't delete that mascot right now.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-background py-12">
      <div className="w-full max-w-lg space-y-6 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Mascot</h1>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            Back
          </button>
        </div>

        {error !== null && <p className="text-sm text-destructive">{error}</p>}

        {mascots === null && error === null && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {mascots !== null && (
          <div className="grid grid-cols-3 gap-4">
            <div
              className={cn(
                "space-y-2 rounded-lg border p-3 text-center",
                selectedId === null ? "border-foreground" : "border-input",
              )}
            >
              <button
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground disabled:opacity-50"
                onClick={() => void handleSelect(null)}
                disabled={busyId !== null}
              >
                Default
              </button>
              {selectedId === null && (
                <p className="text-xs font-medium text-foreground">Selected</p>
              )}
            </div>

            {mascots.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "space-y-2 rounded-lg border p-3 text-center",
                  selectedId === m.id ? "border-foreground" : "border-input",
                )}
              >
                <button
                  className="mx-auto block h-16 w-16 rounded-md bg-muted disabled:opacity-50"
                  onClick={() => void handleSelect(m.id)}
                  disabled={busyId !== null}
                >
                  <img
                    src={m.thumbnail}
                    alt=""
                    className="h-full w-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </button>
                <p className="text-xs text-muted-foreground">
                  {formatCreatedAt(m.createdAt)}
                </p>
                {selectedId === m.id && (
                  <p className="text-xs font-medium text-foreground">
                    Selected
                  </p>
                )}
                <button
                  className="text-xs text-muted-foreground underline hover:text-destructive disabled:opacity-50"
                  onClick={() => void handleDelete(m.id)}
                  disabled={busyId !== null}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className={cn(
            "w-full rounded-md border border-input bg-background px-4 py-2 text-sm",
            "hover:bg-accent hover:text-accent-foreground",
          )}
          onClick={onCreateNew}
        >
          Create new
        </button>
      </div>
    </div>
  );
}
