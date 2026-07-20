import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { SessionSetup } from "./components/SessionSetup";
import { SessionActive } from "./components/SessionActive";
import { PastSessions } from "./components/PastSessions";
import { MascotSetup } from "./components/MascotSetup";
import { MascotLibrary } from "./components/MascotLibrary";
import { PermissionsOnboarding } from "./components/PermissionsOnboarding";
import { SessionSummary } from "./components/SessionSummary";
import { AppShell, type ShellScreen } from "./components/AppShell";
import type { SessionSummaryReadyPayload } from "../../shared/ipc";

type Screen = "setup" | "active" | "past" | "mascotSetup" | "mascotLibrary";

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState("");
  const [permissionsGateNeeded, setPermissionsGateNeeded] = useState<
    boolean | null
  >(null);
  const [pendingSummary, setPendingSummary] =
    useState<SessionSummaryReadyPayload | null>(null);
  // Owned here, not inside SessionSetup, so navigating to the mascot screens
  // and back doesn't unmount-and-lose whatever was already typed.
  const [task, setTask] = useState("");
  const [distractions, setDistractions] = useState("");
  const [approved, setApproved] = useState("");

  useEffect(() => {
    window.api.permissions
      .getStatus()
      .then((status) => {
        const missing = !status.screenRecording || !status.accessibility;
        setPermissionsGateNeeded(missing && !status.onboardingDismissed);
      })
      .catch((err: unknown) => {
        console.error("[App] permissions:getStatus failed:", err);
        setPermissionsGateNeeded(false);
      });
  }, []);

  // Independent of the local onEnded() reset below — a session ends by
  // clicking the mascot window, not this one, so this push is the only way
  // the main window learns a session just ended at all. Kept for the whole
  // lifetime of the app, not scoped to the "active" screen.
  useEffect(() => {
    return window.api.session.onSummaryReady((payload) => {
      setPendingSummary(payload);
    });
  }, []);

  const handleStarted = (id: string, at: string, sessionTask: string): void => {
    setSessionId(id);
    setStartedAt(at);
    setActiveTask(sessionTask);
    setScreen("active");
  };

  const handleEnded = (): void => {
    setSessionId(null);
    setStartedAt(null);
    setActiveTask("");
    setScreen("setup");
  };

  const clearSetup = (): void => {
    setTask("");
    setDistractions("");
    setApproved("");
  };

  const navigate = (next: ShellScreen): void => {
    setPendingSummary(null);
    setScreen(next);
  };

  const renderShell = (content: React.ReactNode, selected: ShellScreen): React.JSX.Element => (
    <AppShell screen={selected} onNavigate={navigate}>{content}</AppShell>
  );

  if (permissionsGateNeeded === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (permissionsGateNeeded) {
    return (
      <PermissionsOnboarding
        onContinue={() => setPermissionsGateNeeded(false)}
      />
    );
  }

  // Takes precedence over whatever `screen` currently holds — resolves any
  // race with handleEnded's own reset-to-setup deterministically, since both
  // fire around the same moment but only one of them carries real data.
  if (pendingSummary !== null) {
    return <><Toaster richColors position="bottom-right" /><AppShell screen="setup" onNavigate={navigate}><SessionSummary
        data={pendingSummary}
        onStartAnother={() => {
          setPendingSummary(null);
          clearSetup();
          setScreen("setup");
        }}
        onViewSessions={() => { setPendingSummary(null); setScreen("past"); }}
      /></AppShell></>;
  }

  if (screen === "active" && sessionId !== null && startedAt !== null) {
    return (
      <>
        <Toaster richColors position="bottom-right" />
        <SessionActive
          sessionId={sessionId}
          startedAt={startedAt}
          task={activeTask}
          onEnded={handleEnded}
        />
      </>
    );
  }

  if (screen === "past") {
    return <><Toaster richColors position="bottom-right" />{renderShell(<PastSessions />, "past")}</>;
  }

  if (screen === "mascotSetup") {
    return <><Toaster richColors position="bottom-right" />{renderShell(<MascotSetup onBack={() => setScreen("mascotLibrary")} />, "mascotLibrary")}</>;
  }

  if (screen === "mascotLibrary") {
    return <><Toaster richColors position="bottom-right" />{renderShell(<MascotLibrary onCreateNew={() => setScreen("mascotSetup")} />, "mascotLibrary")}</>;
  }

  return <><Toaster richColors position="bottom-right" />{renderShell(<SessionSetup
      task={task}
      onTaskChange={setTask}
      distractions={distractions}
      onDistractionsChange={setDistractions}
      approved={approved}
      onApprovedChange={setApproved}
      onStarted={handleStarted}
    />, "setup")}</>;
}
