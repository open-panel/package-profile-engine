import { randomUUID } from "node:crypto";
import { PROFILE_SCHEMA_VERSION, type Profile, type ProfileDocument } from "@open-panel/shared";
import type { Db } from "./db.js";
import { migrateProfileDocument } from "./profile-migrations.js";
import { normalizeFolders } from "./profile-ops.js";
import { validateProfile, validateProfileDocument } from "./validation.js";

interface ProfileRow {
  id: string;
  schema_version: number;
  document: string;
}

/**
 * Owns profile persistence and CRUD (specs.md #12, #19). Depends only on an
 * injected `Db` handle so it can run against an in-memory SQLite database in
 * unit tests, with zero coupling to any device or transport concern.
 */
export class ProfileRepository {
  constructor(private readonly db: Db) {}

  list(): Profile[] {
    const rows = this.db
      .prepare("SELECT id, schema_version, document FROM profiles ORDER BY created_at ASC")
      .all() as unknown as ProfileRow[];
    return rows.map((row) => this.deserialize(row));
  }

  get(id: string): Profile | undefined {
    const row = this.db
      .prepare("SELECT id, schema_version, document FROM profiles WHERE id = ?")
      .get(id) as unknown as ProfileRow | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  create(input: { name: string; id?: string }): Profile {
    const profile = validateProfile({ id: input.id ?? randomUUID(), name: input.name, pages: [] });
    this.insert(profile);
    return profile;
  }

  /** Import/restore a full profile document, migrating and validating it first (specs.md #19, #27). */
  save(document: ProfileDocument): Profile {
    const validated = validateProfileDocument(document);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO profiles (id, schema_version, document, created_at, updated_at)
         VALUES (@id, @schemaVersion, @document, @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           schema_version = @schemaVersion,
           document = @document,
           updated_at = @now`,
      )
      .run({
        id: validated.profile.id,
        schemaVersion: validated.schemaVersion,
        document: JSON.stringify(validated),
        now,
      });
    return validated.profile;
  }

  rename(id: string, name: string): Profile {
    const existing = this.requireProfile(id);
    return this.persist({ ...existing, name });
  }

  update(profile: Profile): Profile {
    validateProfile(profile);
    this.requireProfile(profile.id);
    return this.persist(profile);
  }

  duplicate(id: string, newName?: string): Profile {
    const existing = this.requireProfile(id);
    const copy: Profile = {
      ...existing,
      id: randomUUID(),
      name: newName ?? `${existing.name} copy`,
      pages: existing.pages.map((page) => ({
        ...page,
        id: randomUUID(),
        buttons: page.buttons.map((button) => ({ ...button, id: randomUUID() })),
      })),
    };
    this.insert(copy);
    return copy;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
    const active = this.getActiveProfileId();
    if (active === id) this.db.prepare("DELETE FROM active_profile WHERE singleton = 1").run();
  }

  /** Reset a profile back to an empty state while keeping its id/name (specs.md #19 "Reset Profile"). */
  reset(id: string): Profile {
    const existing = this.requireProfile(id);
    return this.persist({ ...existing, pages: [] });
  }

  setActiveProfile(id: string): void {
    this.requireProfile(id);
    this.db
      .prepare(
        `INSERT INTO active_profile (singleton, profile_id) VALUES (1, ?)
         ON CONFLICT(singleton) DO UPDATE SET profile_id = excluded.profile_id`,
      )
      .run(id);
  }

  getActiveProfileId(): string | undefined {
    const row = this.db
      .prepare("SELECT profile_id FROM active_profile WHERE singleton = 1")
      .get() as unknown as { profile_id: string } | undefined;
    return row?.profile_id;
  }

  getActiveProfile(): Profile | undefined {
    const id = this.getActiveProfileId();
    return id ? this.get(id) : undefined;
  }

  exportDocument(id: string): ProfileDocument {
    const profile = this.requireProfile(id);
    return { schemaVersion: PROFILE_SCHEMA_VERSION, profile };
  }

  private requireProfile(id: string): Profile {
    const existing = this.get(id);
    if (!existing) throw new Error(`Profile not found: ${id}`);
    return existing;
  }

  private persist(profile: Profile): Profile {
    const validated = validateProfile(profile);
    this.db
      .prepare("UPDATE profiles SET document = ?, updated_at = ? WHERE id = ?")
      .run(
        JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, profile: validated }),
        Date.now(),
        validated.id,
      );
    return validated;
  }

  private insert(profile: Profile): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO profiles (id, schema_version, document, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id,
        PROFILE_SCHEMA_VERSION,
        JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, profile }),
        now,
        now,
      );
  }

  private deserialize(row: ProfileRow): Profile {
    const raw = JSON.parse(row.document) as Record<string, unknown>;
    const migrated = migrateProfileDocument(raw);
    // Normalized on the way out, not only in the v1 -> v2 migration: a profile
    // already stored as v2 can still carry a folder page with no Back key,
    // written by a build from before that was an invariant. Idempotent, so the
    // repair simply sticks the next time the profile is written.
    return normalizeFolders(migrated.profile);
  }
}
