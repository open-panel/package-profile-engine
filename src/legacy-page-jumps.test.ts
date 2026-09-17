import { describe, expect, it } from "vitest";
import { PROFILE_SCHEMA_VERSION } from "@open-panel/shared";
import { convertFirstLastPageActions } from "./legacy-page-jumps.js";
import { migrateProfileDocument } from "./profile-migrations.js";

/**
 * `page.first` / `page.last` were retired in favour of picking the page in
 * "Go to Page". Keys already configured with them must keep doing the same
 * thing, which means pointing at the page they used to jump to.
 */

const button = (position: number, type: string) => ({
  id: `b${position}`,
  position,
  appearance: {},
  action: { type, config: {} },
});

describe("convertFirstLastPageActions", () => {
  it("points a first-page key at the layer's first page", () => {
    const profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "one", name: "1", buttons: [] },
        { id: "two", name: "2", buttons: [button(0, "page.first")] },
        { id: "three", name: "3", buttons: [] },
      ],
    };

    const converted = convertFirstLastPageActions(profile);

    expect(converted.pages[1]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "one" },
    });
  });

  it("points a last-page key at the layer's last page", () => {
    const profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "one", name: "1", buttons: [button(1, "page.last")] },
        { id: "two", name: "2", buttons: [] },
        { id: "three", name: "3", buttons: [] },
      ],
    };

    const converted = convertFirstLastPageActions(profile);

    expect(converted.pages[0]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "three" },
    });
  });

  it("resolves within the key's own folder, not across the profile", () => {
    const profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root1", name: "1", buttons: [] },
        { id: "root2", name: "2", buttons: [] },
        {
          id: "inner1",
          name: "1",
          buttons: [button(0, "page.first")],
          parentButtonId: "folderKey",
        },
        { id: "inner2", name: "2", buttons: [button(0, "page.last")], parentButtonId: "folderKey" },
      ],
    };

    const converted = convertFirstLastPageActions(profile);

    expect(converted.pages[2]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "inner1" },
    });
    expect(converted.pages[3]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "inner2" },
    });
  });

  it("leaves every other action alone", () => {
    const profile = {
      id: "p1",
      name: "Dev",
      pages: [
        {
          id: "one",
          name: "1",
          buttons: [button(0, "page.next"), button(1, "hotkey"), button(2, "page.indicator")],
        },
      ],
    };

    expect(convertFirstLastPageActions(profile)).toEqual(profile);
  });

  it("passes through anything that is not a recognisable profile", () => {
    expect(convertFirstLastPageActions({ pages: 7 })).toEqual({ pages: 7 });
    expect(convertFirstLastPageActions(undefined)).toBeUndefined();
  });
});

describe("v2 -> v3 migration", () => {
  it("upgrades a stored profile's first/last keys", () => {
    const v2 = {
      schemaVersion: 2,
      profile: {
        id: "p1",
        name: "Dev",
        pages: [
          { id: "one", name: "1", buttons: [button(0, "page.last")] },
          { id: "two", name: "2", buttons: [button(0, "page.first")] },
        ],
      },
    };

    const migrated = migrateProfileDocument(v2);

    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(migrated.profile.pages[0]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "two" },
    });
    expect(migrated.profile.pages[1]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "one" },
    });
  });

  it("carries a v1 profile all the way to the current version", () => {
    const v1 = {
      schemaVersion: 1,
      profile: {
        id: "p1",
        name: "Dev",
        pages: [
          { id: "one", name: "1", buttons: [button(0, "page.first")] },
          { id: "two", name: "2", buttons: [] },
        ],
      },
    };

    const migrated = migrateProfileDocument(v1);

    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(migrated.profile.pages[0]!.buttons[0]!.action).toEqual({
      type: "change-page",
      config: { pageId: "one" },
    });
  });
});
