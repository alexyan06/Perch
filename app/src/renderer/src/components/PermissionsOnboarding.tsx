import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PermissionsGetStatusResponse } from "../../../shared/ipc";

interface Props {
  onContinue: () => void;
}

function PermissionRow({
  label,
  granted,
  explanation,
  actionLabel,
  onAction,
}: {
  label: string;
  granted: boolean;
  explanation: string;
  actionLabel: string;
  onAction: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-input p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <span
          className={cn(
            "text-xs",
            granted ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {granted ? "Granted" : "Not granted"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{explanation}</p>
      {!granted && (
        <button
          className="text-xs text-foreground underline hover:no-underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function PermissionsOnboarding({
  onContinue,
}: Props): React.JSX.Element {
  const [status, setStatus] = useState<PermissionsGetStatusResponse | null>(
    null,
  );

  const refresh = async (): Promise<void> => {
    const result = await window.api.permissions.getStatus();
    setStatus(result);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleOpenScreenRecording = async (): Promise<void> => {
    await window.api.permissions.openScreenRecordingSettings();
  };

  const handleGrantAccessibility = async (): Promise<void> => {
    await window.api.permissions.requestAccessibility();
    await refresh();
  };

  const handleContinueAnyway = async (): Promise<void> => {
    await window.api.permissions.dismissOnboarding();
    onContinue();
  };

  if (status === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const anythingMissing = !status.screenRecording || !status.accessibility;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-card p-8 text-card-foreground shadow-md">
        <h1 className="text-xl font-semibold">Before you start</h1>
        <p className="text-sm text-muted-foreground">
          This app watches your active window and, occasionally, takes a
          screenshot to check what's on screen. Both need macOS permissions
          granted first.
        </p>

        <PermissionRow
          label="Screen Recording"
          granted={status.screenRecording}
          explanation="Needed for reading window titles and taking a screenshot when a distraction is genuinely unclear."
          actionLabel="Open Settings"
          onAction={() => void handleOpenScreenRecording()}
        />

        <PermissionRow
          label="Accessibility"
          granted={status.accessibility}
          explanation="Needed for accurately detecting your active window."
          actionLabel="Grant"
          onAction={() => void handleGrantAccessibility()}
        />

        {anythingMissing && (
          <p className="text-xs text-muted-foreground">
            After granting Screen Recording, macOS sometimes needs the app
            restarted before it takes effect.
          </p>
        )}

        <div className="flex gap-2">
          <button
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm",
              "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => void refresh()}
          >
            Recheck
          </button>
          <button
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm",
              "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => void handleContinueAnyway()}
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
