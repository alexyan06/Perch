import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { newId } from "./db";
import { STAGE_ORDER, type StageName } from "./mascot-setup";

function mascotsRoot(): string {
  return join(app.getPath("userData"), "mascots");
}

function mascotDir(id: string): string {
  return join(mascotsRoot(), id);
}

function selectedFilePath(): string {
  return join(mascotsRoot(), "selected.json");
}

// `null` means "use the bundled default" — a real, selectable option, not
// just the absence of one.
export function getSelectedMascotId(): string | null {
  const path = selectedFilePath();
  if (!existsSync(path)) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof data !== "object" ||
      data === null ||
      !("selectedMascotId" in data)
    ) {
      return null;
    }
    const value = (data as { selectedMascotId: unknown }).selectedMascotId;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function selectMascot(id: string | null): void {
  mkdirSync(mascotsRoot(), { recursive: true });
  writeFileSync(selectedFilePath(), JSON.stringify({ selectedMascotId: id }));
}

function readMascotImages(dir: string): Record<StageName, string> | null {
  try {
    const result: Partial<Record<StageName, string>> = {};
    for (const name of STAGE_ORDER) {
      const filePath = join(dir, `${name}.png`);
      if (!existsSync(filePath)) return null;
      result[name] =
        `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
    }
    return result as Record<StageName, string>;
  } catch (err) {
    console.error(
      `[mascot-library] failed to read mascot images from ${dir}:`,
      err,
    );
    return null;
  }
}

export function getActiveMascotImages(): Record<StageName, string> | null {
  const selectedId = getSelectedMascotId();
  if (selectedId === null) return null;
  return readMascotImages(mascotDir(selectedId));
}

export interface MascotListEntry {
  id: string;
  createdAt: string;
  thumbnail: string;
}

function readCreatedAt(metadataPath: string): string {
  try {
    const data: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (typeof data === "object" && data !== null && "createdAt" in data) {
      const value = (data as { createdAt: unknown }).createdAt;
      if (typeof value === "string") return value;
    }
  } catch {
    // falls through to the default below
  }
  return new Date(0).toISOString();
}

export function listMascots(): MascotListEntry[] {
  const root = mascotsRoot();
  if (!existsSync(root)) return [];

  const entries: MascotListEntry[] = [];
  for (const dirent of readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const id = dirent.name;
    const dir = mascotDir(id);
    const metadataPath = join(dir, "metadata.json");
    const calmPath = join(dir, "calm.png");
    if (!existsSync(metadataPath) || !existsSync(calmPath)) continue;

    try {
      entries.push({
        id,
        createdAt: readCreatedAt(metadataPath),
        thumbnail: `data:image/png;base64,${readFileSync(calmPath).toString("base64")}`,
      });
    } catch (err) {
      console.error(`[mascot-library] skipping unreadable mascot ${id}:`, err);
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveNewMascot(stages: Record<StageName, string>): {
  id: string;
  savedAt: string;
} {
  const id = newId();
  const dir = mascotDir(id);
  mkdirSync(dir, { recursive: true });

  for (const name of STAGE_ORDER) {
    const base64 = stages[name].split(",")[1];
    writeFileSync(join(dir, `${name}.png`), Buffer.from(base64, "base64"));
  }

  const savedAt = new Date().toISOString();
  writeFileSync(
    join(dir, "metadata.json"),
    JSON.stringify({ createdAt: savedAt }),
  );

  // Generating and saving a new one becomes the active mascot immediately,
  // matching the existing pre-library behavior where saving meant "this is
  // now my mascot."
  selectMascot(id);

  return { id, savedAt };
}

export function deleteMascot(id: string): void {
  rmSync(mascotDir(id), { recursive: true, force: true });
  // If the deleted one was selected, fall back to the default rather than
  // silently picking a different saved mascot the user didn't choose.
  if (getSelectedMascotId() === id) {
    selectMascot(null);
  }
}

// One-time, idempotent: moves the pre-library single `mascots/active/`
// directory into the new per-id scheme instead of silently orphaning
// whatever was already generated there. Only acts if that legacy directory
// exists and the new layout hasn't been initialized yet.
export function migrateLegacyMascotIfNeeded(): void {
  const legacyDir = join(mascotsRoot(), "active");
  if (!existsSync(legacyDir) || existsSync(selectedFilePath())) return;

  if (readMascotImages(legacyDir) === null) {
    // Present but not a complete, valid set — nothing worth salvaging.
    rmSync(legacyDir, { recursive: true, force: true });
    return;
  }

  const id = newId();
  renameSync(legacyDir, mascotDir(id));

  // The legacy format used `generatedAt`; carry that real timestamp over as
  // `createdAt` instead of resetting it to "now" during migration.
  const metadataPath = join(mascotDir(id), "metadata.json");
  let createdAt = new Date().toISOString();
  try {
    const legacy: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (
      typeof legacy === "object" &&
      legacy !== null &&
      "generatedAt" in legacy &&
      typeof (legacy as { generatedAt: unknown }).generatedAt === "string"
    ) {
      createdAt = (legacy as { generatedAt: string }).generatedAt;
    }
  } catch {
    // keep the "now" fallback above
  }
  writeFileSync(metadataPath, JSON.stringify({ createdAt }));

  selectMascot(id);
}
