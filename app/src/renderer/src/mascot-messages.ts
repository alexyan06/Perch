// Copy here follows the ui-voice skill: no exclamation points, no moralizing,
// restate the user's own stated task/facts rather than editorialize. Stage 1
// stays purely declarative (no questions) per that guide's stage-1 rule.

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

type MessageTemplate = (task: string, distractedSinceSeconds: number) => string;

export const GENTLE_MESSAGES: MessageTemplate[] = [
  (task) => `You said you were working on: ${task}.`,
  (task) => `Keeping an eye on: ${task}.`,
  (task) => `This doesn't look like: ${task}.`,
  (task) => `You were working on: ${task}.`,
];

export const UPSET_MESSAGES: MessageTemplate[] = [
  (task) => `hey — weren't we working on: ${task}?`,
  (task) => `Still thinking about: ${task}?`,
  (task) => `This doesn't seem like: ${task}.`,
  (task) => `Come back to: ${task}?`,
];

export const BREAKDOWN_MESSAGES: MessageTemplate[] = [
  (task, seconds) =>
    `It's been ${formatDuration(seconds)} since you said you wanted to: ${task}`,
  (task, seconds) => `${formatDuration(seconds)} away from: ${task}.`,
  (task, seconds) =>
    `You said: ${task}. That was ${formatDuration(seconds)} ago.`,
];

export const RESET_MESSAGES: MessageTemplate[] = [
  (task) => `Back on: ${task}.`,
  (task) => `Picking back up: ${task}.`,
  (task) => `Back to: ${task}.`,
  () => `On track again.`,
];

function pickFrom(
  pool: MessageTemplate[],
  task: string,
  distractedSinceSeconds: number,
): string {
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template(task, distractedSinceSeconds);
}

export function pickMascotMessage(
  stage: 1 | 2 | 3,
  task: string,
  distractedSinceSeconds: number,
): string {
  const pool =
    stage === 1
      ? GENTLE_MESSAGES
      : stage === 2
        ? UPSET_MESSAGES
        : BREAKDOWN_MESSAGES;
  return pickFrom(pool, task, distractedSinceSeconds);
}

export function pickResetMessage(task: string): string {
  return pickFrom(RESET_MESSAGES, task, 0);
}
