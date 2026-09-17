import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { SettingsRepository } from "./settings-repository.js";

describe("SettingsRepository", () => {
  it("returns undefined for a key that was never set", () => {
    const repo = new SettingsRepository(openDatabase(":memory:"));
    expect(repo.get("missing")).toBeUndefined();
  });

  it("round-trips a value", () => {
    const repo = new SettingsRepository(openDatabase(":memory:"));
    repo.set("a", "1");
    expect(repo.get("a")).toBe("1");
  });

  it("overwrites an existing value instead of erroring", () => {
    const repo = new SettingsRepository(openDatabase(":memory:"));
    repo.set("a", "1");
    repo.set("a", "2");
    expect(repo.get("a")).toBe("2");
  });
});
