export type MascotMessageStage = "gentle" | "upset" | "breakdown" | "reset";

export interface MascotMessagePack {
  gentle: string[];
  upset: string[];
  breakdown: string[];
  reset: string[];
}

export interface MascotMessagePicker {
  pickNudge(
    stage: 1 | 2 | 3,
    task: string,
    distractedSinceSeconds: number,
    escalationReason?: "elapsed" | "rapid_relapse",
  ): string;
  pickReset(task: string): string;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export const FALLBACK_MASCOT_MESSAGE_PACK: MascotMessagePack = {
  gentle: [
    "The next step is still waiting.",
    "Nothing is lost; it is ready when you are.",
    "A small reset is enough.",
    "The thread is still there.",
    "The work can pick up from here.",
  ],
  upset: [
    "The detour has had enough room.",
    "The next move is clear.",
    "This can wait a little longer.",
    "There is no need to keep circling here.",
    "The useful screen is the other one.",
  ],
  breakdown: [
    "The pause has gone on long enough.",
    "It is time to make the next move.",
    "The detour is taking more than it gives.",
    "The task is still open.",
    "There is a better place for this minute.",
  ],
  reset: [
    "Keep that thread going.",
    "That is the right screen.",
    "One step at a time from here.",
    "The rhythm is back.",
    "Stay with this next move.",
  ],
};

export function createMascotFallbackMessagePack(): MascotMessagePack {
  return FALLBACK_MASCOT_MESSAGE_PACK;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const nextIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [
      shuffled[nextIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function createMessageBag(
  templates: string[],
  random: () => number,
): () => string {
  let remaining: string[] = [];
  return () => {
    if (remaining.length === 0) remaining = shuffle(templates, random);
    const template = remaining.pop();
    if (template === undefined) throw new Error("[mascot-messages] empty message bag");
    return template;
  };
}

function renderMessage(
  template: string,
  task: string,
  distractedSinceSeconds = 0,
): string {
  return template
    .split("{task}")
    .join(task)
    .split("{duration}")
    .join(formatDuration(distractedSinceSeconds));
}

export function createMascotMessagePicker(
  pack: MascotMessagePack,
  random: () => number = Math.random,
): MascotMessagePicker {
  const gentle = createMessageBag(pack.gentle, random);
  const upset = createMessageBag(pack.upset, random);
  const breakdown = createMessageBag(pack.breakdown, random);
  const reset = createMessageBag(pack.reset, random);

  return {
    pickNudge(stage, task, distractedSinceSeconds, escalationReason = "elapsed") {
      const fragment =
        stage === 1
          ? gentle()
          : stage === 2
            ? upset()
            : breakdown();
      const message =
        stage === 1
          ? `You're off task. Get back to {task}.`
          : stage === 2
            ? `Still off task. Get back to {task}.`
            : escalationReason === "rapid_relapse"
              ? `You're off task again. Get back to {task}.`
              : `You've been away from {task} for {duration}. Get back to it.`;
      return `${renderMessage(message, task, distractedSinceSeconds)} ${fragment}`;
    },
    pickReset(task) {
      return `Good, you're back on ${task}. ${reset()}`;
    },
  };
}
