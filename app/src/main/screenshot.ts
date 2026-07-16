export async function captureActiveWindowScreenshot(
  windowTitle: string | null,
): Promise<string | null> {
  if (windowTitle === null || windowTitle.length === 0) return null;

  // Imported lazily so this module can be loaded (e.g. in isolated tests)
  // without requiring a real Electron runtime — only paid for on an actual capture.
  const { desktopCapturer } = await import("electron");

  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1280, height: 800 },
  });

  const match =
    sources.find((s) => s.name === windowTitle) ??
    sources.find(
      (s) =>
        s.name.length > 0 &&
        (windowTitle.includes(s.name) || s.name.includes(windowTitle)),
    );

  if (!match || match.thumbnail.isEmpty()) return null;

  return match.thumbnail.toPNG().toString("base64");
}
