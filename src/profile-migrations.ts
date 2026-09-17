import { PROFILE_SCHEMA_VERSION, type ProfileDocument } from "@open-panel/shared";
import { convertLegacyFolders } from "./legacy-folders.js";
import { convertFirstLastPageActions } from "./legacy-page-jumps.js";
import { ensureFolderBackKeys } from "./profile-ops.js";

/**
 * Content migrations for the persisted profile document shape, keyed by the
 * version being migrated FROM. Adding v2 means adding an entry here — existing
 * profiles are upgraded in place, never silently broken (specs.md #27).
 */
type MigrationStep = (doc: Record<string, unknown>) => Record<string, unknown>;

const steps: Record<number, MigrationStep> = {
  /**
   * v1 -> v2: pages became a tree (Page.parentButtonId) so folders can nest.
   *
   * An absent parentButtonId already means "root page", so existing pages need
   * no rewriting — except the folders an earlier build faked with a pair of
   * `change-page` keys. Those are real root pages, so they would keep showing
   * up in the page selector and in next/previous navigation; convertLegacyFolders
   * turns the ones with that exact signature into nested pages.
   */
  1: (doc) => {
    const profile = convertLegacyFolders(doc.profile);
    return {
      ...doc,
      schemaVersion: 2,
      // Every page inside a folder needs its own way out; converted pages and
      // pages added before that rule get one here.
      profile: isProfileShape(profile) ? ensureFolderBackKeys(profile) : profile,
    };
  },

  /**
   * v2 -> v3: `page.first` and `page.last` were retired in favour of picking
   * the page in "Go to Page", whose picker marks which is first and which is
   * last. Existing keys are pointed at the page they used to jump to.
   */
  2: (doc) => ({
    ...doc,
    schemaVersion: 3,
    profile: convertFirstLastPageActions(doc.profile),
  }),
};

function isProfileShape(value: unknown): value is Parameters<typeof ensureFolderBackKeys>[0] {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { pages?: unknown }).pages) &&
    (value as { pages: unknown[] }).pages.every(
      (page) =>
        !!page &&
        typeof page === "object" &&
        Array.isArray((page as { buttons?: unknown }).buttons),
    )
  );
}

export class UnsupportedProfileVersionError extends Error {
  constructor(version: number) {
    super(`Profile schema version ${version} is newer than supported (${PROFILE_SCHEMA_VERSION}).`);
    this.name = "UnsupportedProfileVersionError";
  }
}

export function migrateProfileDocument(raw: Record<string, unknown>): ProfileDocument {
  let doc = raw;
  let version = Number(doc.schemaVersion ?? 1);

  if (version > PROFILE_SCHEMA_VERSION) {
    throw new UnsupportedProfileVersionError(version);
  }

  while (version < PROFILE_SCHEMA_VERSION) {
    const step = steps[version];
    if (!step) break;
    doc = step(doc);
    version = Number(doc.schemaVersion ?? version + 1);
  }

  return doc as unknown as ProfileDocument;
}
