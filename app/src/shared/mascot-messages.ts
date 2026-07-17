export type MascotMessageStage = "gentle" | "upset" | "breakdown" | "reset";

export interface MascotMessagePack {
  gentle: string[];
  upset: string[];
  breakdown: string[];
  reset: string[];
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export const GENERIC_MASCOT_MESSAGE_PACK: MascotMessagePack = {
  gentle: [
    "You said you were working on: {task}.",
    "Keeping an eye on: {task}.",
    "This doesn't look like: {task}.",
    "You were working on: {task}.",
  ],
  upset: [
    "Still thinking about: {task}.",
    "This doesn't seem like: {task}.",
    "Come back to: {task}.",
    "Your task was: {task}.",
  ],
  breakdown: [
    "It's been {duration} since you said you wanted to: {task}",
    "{duration} away from: {task}.",
    "You said: {task}. That was {duration} ago.",
    "Still away from {task} after {duration}.",
  ],
  reset: [
    "Back on: {task}.",
    "Picking back up: {task}.",
    "Back to: {task}.",
    "On track again: {task}.",
  ],
};

export function pickMascotMessage(
  pack: MascotMessagePack,
  stage: 1 | 2 | 3,
  task: string,
  distractedSinceSeconds: number,
): string {
  const templates =
    stage === 1 ? pack.gentle : stage === 2 ? pack.upset : pack.breakdown;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template
    .split("{task}")
    .join(task)
    .split("{duration}")
    .join(formatDuration(distractedSinceSeconds));
}

export function pickResetMessage(pack: MascotMessagePack, task: string): string {
  const template = pack.reset[Math.floor(Math.random() * pack.reset.length)];
  return template.split("{task}").join(task);
}
