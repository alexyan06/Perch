import { app, shell, systemPreferences } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface PermissionStatus {
  screenRecording: boolean;
  accessibility: boolean;
}

// Checked fresh every launch, never cached — if a permission gets revoked
// later, the next check should reflect that, not a stale "you're fine"
// assumption. Both checks are darwin-only per Electron's own docs; Windows
// always reports "granted" for screen access and has no equivalent concept
// of Accessibility trust, so there's nothing to gate on other platforms.
export function getPermissionStatus(): PermissionStatus {
  if (process.platform !== "darwin") {
    return { screenRecording: true, accessibility: true };
  }
  return {
    screenRecording:
      systemPreferences.getMediaAccessStatus("screen") === "granted",
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
  };
}

// No programmatic OS prompt exists for Screen Recording — the only way to
// grant it is through System Settings, so this just opens straight to the
// right pane instead of the generic Privacy & Security list.
export async function openScreenRecordingSettings(): Promise<void> {
  await shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  );
}

// Unlike Screen Recording, Accessibility does support a native OS prompt.
export function requestAccessibility(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(true);
}

function onboardingFlagPath(): string {
  return join(app.getPath("userData"), "onboarding.json");
}

export function isOnboardingDismissed(): boolean {
  const path = onboardingFlagPath();
  if (!existsSync(path)) return false;
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return (
      typeof data === "object" &&
      data !== null &&
      "dismissedPermissionsGate" in data &&
      data.dismissedPermissionsGate === true
    );
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  writeFileSync(
    onboardingFlagPath(),
    JSON.stringify({ dismissedPermissionsGate: true }),
  );
}
