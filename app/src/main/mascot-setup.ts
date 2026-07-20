import {
  generateBaseSprite as callGenerateBaseSprite,
  generateStageVariant,
} from "./openai-image-client";
import { postProcessSprite } from "./mascot-image";

export type StageName = "calm" | "gentle" | "upset" | "breakdown" | "hello";
export const STAGE_ORDER: StageName[] = [
  "calm",
  "gentle",
  "upset",
  "breakdown",
  "hello",
];
const STAGE_NUMBER: Record<StageName, 0 | 1 | 2 | 3 | 4> = {
  calm: 0,
  gentle: 1,
  upset: 2,
  breakdown: 3,
  hello: 4,
};

export interface StageResult {
  rawBase64: string;
  rawMimeType: string;
  processedDataUrl: string;
}

// The source photo is held here, in main-process memory only — never
// written to disk, per docs/mascot-generation.md §3.
let selectedPhoto: { data: Buffer; mimeType: string } | null = null;

const stageResults: Partial<Record<StageName, StageResult>> = {};

export function setSelectedPhoto(data: Buffer, mimeType: string): void {
  selectedPhoto = { data, mimeType };
}

export function getSelectedPhotoPreviewDataUrl(): string | null {
  if (selectedPhoto === null) return null;
  return `data:${selectedPhoto.mimeType};base64,${selectedPhoto.data.toString("base64")}`;
}

/**
 * Which earlier-stage raw images to hand the model as character references
 * for a given target asset — e.g. hello gets [calm, gentle, upset, breakdown].
 * Pure and exported so it's testable without a live API call: a stage that
 * failed or hasn't been generated yet is just skipped rather than blocking,
 * so "regenerate one stage without redoing the whole set" always works.
 */
export function buildReferenceList(
  results: Partial<Record<StageName, StageResult>>,
  target: StageName,
): Array<{ base64: string; mimeType: string }> {
  const targetIndex = STAGE_NUMBER[target];
  return STAGE_ORDER.slice(0, targetIndex)
    .map((name) => results[name])
    .filter((r): r is StageResult => r !== undefined)
    .map((r) => ({ base64: r.rawBase64, mimeType: r.rawMimeType }));
}

/** Returns a fully post-processed `data:image/png;base64,...` URL. */
export async function generateBaseSprite(): Promise<string> {
  if (selectedPhoto === null) {
    throw new Error("[mascot-setup] no photo selected");
  }

  const { imageBase64, mimeType } = await callGenerateBaseSprite({
    photoBase64: selectedPhoto.data.toString("base64"),
    mimeType: selectedPhoto.mimeType,
  });

  const processedDataUrl = await postProcessSprite(imageBase64);
  stageResults.calm = {
    rawBase64: imageBase64,
    rawMimeType: mimeType,
    processedDataUrl,
  };
  return processedDataUrl;
}

/** Returns a fully post-processed `data:image/png;base64,...` URL. */
export async function generateStage(
  name: "gentle" | "upset" | "breakdown" | "hello",
): Promise<string> {
  const references = buildReferenceList(stageResults, name);
  if (references.length === 0) {
    throw new Error(
      `[mascot-setup] no reference sprites available to generate ${name}`,
    );
  }

  const { imageBase64, mimeType } = await generateStageVariant({
    stage: STAGE_NUMBER[name] as 1 | 2 | 3 | 4,
    references,
  });

  const processedDataUrl = await postProcessSprite(imageBase64);
  stageResults[name] = {
    rawBase64: imageBase64,
    rawMimeType: mimeType,
    processedDataUrl,
  };
  return processedDataUrl;
}

/** All 5 processed sprites, or null if any stage hasn't succeeded yet. */
export function getStagesForSaving(): Record<StageName, string> | null {
  const entries = STAGE_ORDER.map(
    (name) => [name, stageResults[name]?.processedDataUrl] as const,
  );
  if (entries.some(([, dataUrl]) => dataUrl === undefined)) return null;
  return Object.fromEntries(entries) as Record<StageName, string>;
}
