export type Tier1Result = "on_task" | "distraction" | "ambiguous";

export interface NativeSignal {
  appName: string | null;
  windowTitle: string | null;
}

export interface Tier1Context {
  task: string;
  distractionList: string[];
  approvedList: string[];
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const kw = keyword.trim().toLowerCase();
    return kw.length > 0 && text.includes(kw);
  });
}

export function classifyTier1(
  signal: NativeSignal,
  { task, distractionList, approvedList }: Tier1Context,
): Tier1Result {
  const text = [signal.appName, signal.windowTitle]
    .filter((s): s is string => s !== null && s.length > 0)
    .join(" ")
    .toLowerCase();

  if (text.length === 0) return "ambiguous";

  if (matchesAny(text, distractionList)) return "distraction";
  if (matchesAny(text, approvedList)) return "on_task";

  const taskTokens = task
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  for (const token of taskTokens) {
    if (text.includes(token)) return "on_task";
  }

  return "ambiguous";
}
