import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = join(app.getPath("userData"), "perch.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      declared_task TEXT NOT NULL,
      distraction_list TEXT NOT NULL DEFAULT '[]',
      approved_list TEXT NOT NULL DEFAULT '[]',
      summary_text TEXT,
      next_steps TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS classification_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      timestamp TEXT NOT NULL,
      signal_type TEXT NOT NULL CHECK(signal_type IN ('native', 'browser', 'vision')),
      raw_signal TEXT NOT NULL,
      classification TEXT NOT NULL CHECK(classification IN ('on_task', 'distraction', 'drift', 'ambiguous', 'paused')),
      reasoning TEXT
    );

    CREATE TABLE IF NOT EXISTS distraction_intervals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      max_stage_reached INTEGER NOT NULL DEFAULT 0
    );
  `);

  const classificationEventsSql = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'classification_events'",
    )
    .get() as { sql: string } | undefined;
  if (!classificationEventsSql?.sql.includes("'paused'")) {
    const database = db;
    database.transaction(() => {
      database.exec("ALTER TABLE classification_events RENAME TO classification_events_legacy");
      database.exec(`
        CREATE TABLE classification_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          timestamp TEXT NOT NULL,
          signal_type TEXT NOT NULL CHECK(signal_type IN ('native', 'browser', 'vision')),
          raw_signal TEXT NOT NULL,
          classification TEXT NOT NULL CHECK(classification IN ('on_task', 'distraction', 'drift', 'ambiguous', 'paused')),
          reasoning TEXT
        );
        INSERT INTO classification_events (id, session_id, timestamp, signal_type, raw_signal, classification, reasoning)
        SELECT id, session_id, timestamp, signal_type, raw_signal, classification, reasoning
        FROM classification_events_legacy;
        DROP TABLE classification_events_legacy;
      `);
    })();
  }

  const sessionColumns = db
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{
    name: string;
  }>;
  if (!sessionColumns.some((c) => c.name === "approved_list")) {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN approved_list TEXT NOT NULL DEFAULT '[]'",
    );
  }
  if (!sessionColumns.some((c) => c.name === "next_steps")) {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN next_steps TEXT NOT NULL DEFAULT '[]'",
    );
  }
  // Nullable and left un-backfilled on purpose: sessions ended before this
  // change keep their real summary_text/next_steps rather than losing data,
  // and simply have no stats columns — callers branch on that, not on a
  // fabricated default.
  for (const column of [
    "on_task_seconds INTEGER",
    "distracted_seconds INTEGER",
    "ambiguous_seconds INTEGER",
    "category_breakdown TEXT",
  ]) {
    const name = column.split(" ")[0];
    if (!sessionColumns.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE sessions ADD COLUMN ${column}`);
    }
  }

  return db;
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  declared_task: string;
  distraction_list: string;
  approved_list: string;
  summary_text: string | null;
  next_steps: string;
  on_task_seconds: number | null;
  distracted_seconds: number | null;
  ambiguous_seconds: number | null;
  category_breakdown: string | null;
}

export function createSession(
  task: string,
  distractionList: string[],
  approvedList: string[],
): { id: string; startedAt: string } {
  const db = getDb();
  const id = newId();
  const startedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO sessions (id, started_at, declared_task, distraction_list, approved_list) VALUES (?, ?, ?, ?, ?)",
  ).run(
    id,
    startedAt,
    task,
    JSON.stringify(distractionList),
    JSON.stringify(approvedList),
  );
  return { id, startedAt };
}

export interface SessionStats {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: Array<{ label: string; seconds: number }>;
}

export function endSession(
  sessionId: string,
  endedAt: string,
  stats: SessionStats,
): void {
  getDb()
    .prepare(
      `UPDATE sessions
       SET ended_at = ?, on_task_seconds = ?, distracted_seconds = ?,
           ambiguous_seconds = ?, category_breakdown = ?
       WHERE id = ?`,
    )
    .run(
      endedAt,
      stats.onTaskSeconds,
      stats.distractedSeconds,
      stats.ambiguousSeconds,
      JSON.stringify(stats.categoryBreakdown),
      sessionId,
    );
}

export function getSessionForSummary(sessionId: string): {
  task: string;
  distractionList: string[];
  approvedList: string[];
  startedAt: string;
} | null {
  const row = getDb()
    .prepare(
      "SELECT declared_task, distraction_list, approved_list, started_at FROM sessions WHERE id = ?",
    )
    .get(sessionId) as
    | {
        declared_task: string;
        distraction_list: string;
        approved_list: string;
        started_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    task: row.declared_task,
    distractionList: JSON.parse(row.distraction_list) as string[],
    approvedList: JSON.parse(row.approved_list) as string[],
    startedAt: row.started_at,
  };
}

export function getPastSessions(limit: number): Array<{
  id: string;
  startedAt: string;
  endedAt: string;
  task: string;
  summary?: string;
  nextSteps?: string[];
  onTaskSeconds?: number;
  distractedSeconds?: number;
  ambiguousSeconds?: number;
  categoryBreakdown?: Array<{ label: string; seconds: number }>;
}> {
  const rows = getDb()
    .prepare(
      `SELECT id, started_at, ended_at, declared_task, summary_text, next_steps,
              on_task_seconds, distracted_seconds, ambiguous_seconds, category_breakdown
       FROM sessions
       WHERE ended_at IS NOT NULL
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(limit) as SessionRow[];

  return rows.map((r) => {
    // Stats-based rows (this change) vs. legacy prose-summary rows (before
    // it) are mutually exclusive per session — never mix a fabricated
    // summary with real stats or vice versa.
    if (r.on_task_seconds !== null) {
      return {
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at ?? "",
        task: r.declared_task,
        onTaskSeconds: r.on_task_seconds,
        distractedSeconds: r.distracted_seconds ?? 0,
        ambiguousSeconds: r.ambiguous_seconds ?? 0,
        categoryBreakdown: JSON.parse(r.category_breakdown ?? "[]") as Array<{
          label: string;
          seconds: number;
        }>,
      };
    }
    return {
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at ?? "",
      task: r.declared_task,
      summary: r.summary_text ?? "",
      nextSteps: JSON.parse(r.next_steps) as string[],
    };
  });
}

export function insertClassificationEvent(event: {
  sessionId: string;
  timestamp: string;
  signalType: "native" | "browser" | "vision";
  rawSignal: unknown;
  classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused";
  reasoning?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO classification_events
       (id, session_id, timestamp, signal_type, raw_signal, classification, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      event.sessionId,
      event.timestamp,
      event.signalType,
      JSON.stringify(event.rawSignal),
      event.classification,
      event.reasoning ?? null,
    );
}

export function startDistractionInterval(sessionId: string): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO distraction_intervals (id, session_id, started_at) VALUES (?, ?, ?)",
    )
    .run(id, sessionId, new Date().toISOString());
  return id;
}

export function endDistractionInterval(
  id: string,
  maxStageReached: number,
): void {
  getDb()
    .prepare(
      "UPDATE distraction_intervals SET ended_at = ?, max_stage_reached = ? WHERE id = ?",
    )
    .run(new Date().toISOString(), maxStageReached, id);
}

export interface ClassificationEventForSummary {
  timestamp: string;
  signalType: "native" | "browser" | "vision";
  classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused";
  reasoning: string | null;
  rawSignal: unknown;
}

export function getClassificationEvents(
  sessionId: string,
): ClassificationEventForSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT timestamp, signal_type, classification, reasoning, raw_signal
       FROM classification_events WHERE session_id = ? ORDER BY timestamp ASC`,
    )
    .all(sessionId) as Array<{
    timestamp: string;
    signal_type: "native" | "browser" | "vision";
    classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused";
    reasoning: string | null;
    raw_signal: string;
  }>;

  return rows.map((r) => ({
    timestamp: r.timestamp,
    signalType: r.signal_type,
    classification: r.classification,
    reasoning: r.reasoning,
    rawSignal: JSON.parse(r.raw_signal) as unknown,
  }));
}

export interface DistractionIntervalForSummary {
  startedAt: string;
  endedAt: string | null;
  maxStageReached: number;
}

export function getDistractionIntervals(
  sessionId: string,
): DistractionIntervalForSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT started_at, ended_at, max_stage_reached
       FROM distraction_intervals WHERE session_id = ? ORDER BY started_at ASC`,
    )
    .all(sessionId) as Array<{
    started_at: string;
    ended_at: string | null;
    max_stage_reached: number;
  }>;

  return rows.map((r) => ({
    startedAt: r.started_at,
    endedAt: r.ended_at,
    maxStageReached: r.max_stage_reached,
  }));
}

// No ON DELETE CASCADE on the child tables' foreign keys, so children have
// to go first — wrapped in a transaction so a session row is never left
// half-deleted (or its children orphaned) if something fails partway.
export function deleteSession(sessionId: string): void {
  const db = getDb();
  const run = db.transaction((id: string) => {
    db.prepare("DELETE FROM classification_events WHERE session_id = ?").run(
      id,
    );
    db.prepare("DELETE FROM distraction_intervals WHERE session_id = ?").run(
      id,
    );
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  });
  run(sessionId);
}

export interface SessionStatsRow {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: Array<{ label: string; seconds: number }>;
}

// Only stats-based sessions (on_task_seconds IS NOT NULL) count toward
// trends — legacy prose-summary sessions from before this column existed
// have nothing numeric to aggregate, same branch condition already used in
// getPastSessions to tell the two row shapes apart.
export function getSessionStatsSince(sinceIso: string): SessionStatsRow[] {
  const rows = getDb()
    .prepare(
      `SELECT on_task_seconds, distracted_seconds, ambiguous_seconds, category_breakdown
       FROM sessions
       WHERE started_at >= ? AND on_task_seconds IS NOT NULL`,
    )
    .all(sinceIso) as Array<{
    on_task_seconds: number;
    distracted_seconds: number;
    ambiguous_seconds: number;
    category_breakdown: string | null;
  }>;

  return rows.map((r) => ({
    onTaskSeconds: r.on_task_seconds,
    distractedSeconds: r.distracted_seconds,
    ambiguousSeconds: r.ambiguous_seconds,
    categoryBreakdown: JSON.parse(r.category_breakdown ?? "[]") as Array<{
      label: string;
      seconds: number;
    }>,
  }));
}
