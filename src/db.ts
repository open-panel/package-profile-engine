import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

/**
 * Uses Node's built-in `node:sqlite` (stable as of the Node versions this
 * project targets) instead of a native addon like better-sqlite3 — zero
 * compiled dependencies, so `pnpm install` never needs a C++ toolchain
 * (specs.md #24 Developer Experience).
 *
 * Loaded via `createRequire` instead of a static `import` because Vite/
 * vite-node's bundled list of Node builtins doesn't yet recognize this
 * fairly new module, which otherwise breaks it under Vitest — see
 * https://github.com/vitejs/vite/issues (node:sqlite support).
 */
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

export type Db = DatabaseSyncType;

interface Migration {
  version: number;
  up: (db: Db) => void;
}

/**
 * Structural SQLite migrations (specs.md #19, #27). Each migration is applied
 * exactly once and tracked in the `migrations` table — existing databases are
 * never silently rewritten outside of this list.
 */
const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL,
          document TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS active_profile (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          profile_id TEXT NOT NULL
        );
      `);
    },
  },
];

export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    db
      .prepare("SELECT version FROM migrations")
      .all()
      .map((r) => Number((r as { version: number }).version)),
  );
  const insert = db.prepare("INSERT INTO migrations (version, applied_at) VALUES (?, ?)");
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      insert.run(migration.version, Date.now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
