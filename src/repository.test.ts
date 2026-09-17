import { beforeEach, describe, expect, it } from "vitest";
import { PROFILE_SCHEMA_VERSION } from "@open-panel/shared";
import { openDatabase } from "./db.js";
import { ProfileRepository } from "./repository.js";
import { ProfileValidationError } from "./validation.js";
import { addPage, upsertButton } from "./profile-ops.js";

function createRepo(): ProfileRepository {
  const db = openDatabase(":memory:");
  return new ProfileRepository(db);
}

describe("ProfileRepository", () => {
  let repo: ProfileRepository;

  beforeEach(() => {
    repo = createRepo();
  });

  it("creates and retrieves a profile with a stable id", () => {
    const profile = repo.create({ name: "Development" });
    expect(profile.id).toBeTruthy();
    expect(repo.get(profile.id)?.name).toBe("Development");
  });

  it("renames a profile", () => {
    const profile = repo.create({ name: "Dev" });
    const renamed = repo.rename(profile.id, "Development");
    expect(renamed.name).toBe("Development");
    expect(repo.get(profile.id)?.name).toBe("Development");
  });

  it("duplicates a profile with new ids for pages and buttons", () => {
    let profile = repo.create({ name: "Dev" });
    profile = addPage(profile, "Main");
    profile = upsertButton(profile, profile.pages[0]!.id, {
      position: 0,
      appearance: { label: "Build" },
    });
    repo.update(profile);

    const duplicate = repo.duplicate(profile.id, "Dev Copy");

    expect(duplicate.id).not.toBe(profile.id);
    expect(duplicate.pages[0]!.id).not.toBe(profile.pages[0]!.id);
    expect(duplicate.pages[0]!.buttons[0]!.id).not.toBe(profile.pages[0]!.buttons[0]!.id);
    expect(duplicate.pages[0]!.buttons[0]!.appearance.label).toBe("Build");
  });

  it("deletes a profile", () => {
    const profile = repo.create({ name: "Temp" });
    repo.delete(profile.id);
    expect(repo.get(profile.id)).toBeUndefined();
  });

  it("selects and reports the active profile", () => {
    const a = repo.create({ name: "A" });
    repo.create({ name: "B" });
    repo.setActiveProfile(a.id);
    expect(repo.getActiveProfile()?.id).toBe(a.id);
  });

  it("persists changes across repository instances against the same db handle", () => {
    const db = openDatabase(":memory:");
    const repoA = new ProfileRepository(db);
    const created = repoA.create({ name: "Persisted" });

    const repoB = new ProfileRepository(db);
    expect(repoB.get(created.id)?.name).toBe("Persisted");
  });

  it("rejects invalid profiles at the validation boundary", () => {
    expect(() => repo.update({ id: "x", name: "", pages: [] })).toThrow(ProfileValidationError);
  });

  it("exports a portable profile document with schemaVersion", () => {
    const profile = repo.create({ name: "Dev" });
    const doc = repo.exportDocument(profile.id);
    expect(doc.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(doc.profile.id).toBe(profile.id);
  });
});
