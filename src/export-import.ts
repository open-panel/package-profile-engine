import { readFile, writeFile } from "node:fs/promises";
import type { ProfileDocument } from "@open-panel/shared";
import { validateProfileDocument } from "./validation.js";
import { migrateProfileDocument } from "./profile-migrations.js";

/** Portable JSON export/import, independent of the SQLite storage layer (specs.md #19). */
export async function exportProfileToFile(
  document: ProfileDocument,
  filePath: string,
): Promise<void> {
  await writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
}

export async function importProfileFromFile(filePath: string): Promise<ProfileDocument> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const migrated = migrateProfileDocument(parsed as Record<string, unknown>);
  return validateProfileDocument(migrated);
}
