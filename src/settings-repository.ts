import type { Db } from "./db.js";

interface SettingRow {
  value: string;
}

/**
 * Generic key/value persistence on top of the `settings` table created by
 * migration 1 (db.ts) — unused until now. Callers own their own key naming
 * and JSON (de)serialization; this just keeps the two SQL statements in one
 * place instead of duplicated per feature.
 */
export class SettingsRepository {
  constructor(private readonly db: Db) {}

  get(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as unknown as
      SettingRow | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }
}
