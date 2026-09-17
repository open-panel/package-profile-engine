import { describe, expect, it } from "vitest";
import { PROFILE_SCHEMA_VERSION, type Profile } from "@open-panel/shared";
import {
  addPage,
  createFolder,
  ensureFolderBackKeys,
  deletePage,
  findPageContainingButton,
  isFolderButton,
  pagesInLayer,
  pruneOrphanPages,
  removeButton,
  replaceButton,
} from "./profile-ops.js";
import { migrateProfileDocument } from "./profile-migrations.js";

/**
 * Folders are pages that name the button they live behind, so they nest to any
 * depth and every layer numbers its own pages. These cover the invariants the
 * runtime and the UI both rely on.
 */

const base = (): Profile => ({ id: "p1", name: "Dev", pages: [] });

/** Root page with one folder on it, and one page inside that folder. */
function withFolder() {
  let profile = addPage(base(), "1");
  const root = profile.pages[0]!;
  profile = createFolder(profile, root.id, 3);
  const folderButton = profile.pages[0]!.buttons.find((button) => button.position === 3)!;
  const inner = pagesInLayer(profile, folderButton.id)[0]!;
  return { profile, root, folderButton, inner };
}

describe("createFolder", () => {
  it("makes the key a folder with one page behind it", () => {
    const { profile, folderButton, inner } = withFolder();

    expect(folderButton.action).toEqual({ type: "folder.open", config: {} });
    expect(folderButton.appearance.label).toBe("Folder");
    expect(inner.parentButtonId).toBe(folderButton.id);
    expect(isFolderButton(profile, folderButton.id)).toBe(true);
  });

  it("puts an escape key inside, so a folder is never a dead end", () => {
    const { inner } = withFolder();
    const back = inner.buttons.find((button) => button.position === 0);

    expect(back?.action).toEqual({ type: "folder.back", config: {} });
    expect(back?.appearance.label).toBe("Back");
  });

  it("keeps the folder's pages out of the root layer", () => {
    const { profile, root } = withFolder();

    expect(pagesInLayer(profile).map((page) => page.id)).toEqual([root.id]);
    expect(profile.pages).toHaveLength(2);
  });

  it("nests: a folder inside a folder has its own layer of pages", () => {
    const { profile, inner } = withFolder();

    const deeper = createFolder(profile, inner.id, 5);
    const innerFolderButton = deeper.pages
      .find((page) => page.id === inner.id)!
      .buttons.find((button) => button.position === 5)!;
    const deepest = pagesInLayer(deeper, innerFolderButton.id);

    expect(deepest).toHaveLength(1);
    expect(pagesInLayer(deeper)).toHaveLength(1); // the root layer is untouched
    expect(findPageContainingButton(deeper, innerFolderButton.id)?.id).toBe(inner.id);
  });

  it("numbers pages per layer, not globally", () => {
    const { profile, folderButton, inner } = withFolder();
    const withSecondInnerPage = addPage(profile, "2", folderButton.id);

    expect(pagesInLayer(withSecondInnerPage, folderButton.id).map((page) => page.name)).toEqual([
      "1",
      "2",
    ]);
    expect(pagesInLayer(withSecondInnerPage).map((page) => page.name)).toEqual(["1"]);
    expect(inner.name).toBe("1");
  });
});

describe("pruning unreachable pages", () => {
  it("drops a folder's pages when the folder key is removed", () => {
    const { profile, root, folderButton } = withFolder();

    const cleared = removeButton(profile, root.id, 3);

    expect(pagesInLayer(cleared, folderButton.id)).toEqual([]);
    expect(cleared.pages).toHaveLength(1);
  });

  it("drops a folder's pages when the key is reassigned to something else", () => {
    const { profile, root, folderButton } = withFolder();

    const reassigned = replaceButton(profile, root.id, {
      id: folderButton.id,
      position: 3,
      appearance: {},
      action: { type: "hotkey", config: { keys: ["CTRL", "P"] } },
    });

    expect(pagesInLayer(pruneOrphanPages(reassigned), folderButton.id)).toEqual([]);
  });

  it("drops nested layers all the way down when the top page goes", () => {
    const { profile, root, inner } = withFolder();
    const deeper = createFolder(profile, inner.id, 5);
    expect(deeper.pages).toHaveLength(3);

    const gone = deletePage(deeper, root.id);

    expect(gone.pages).toEqual([]);
  });

  it("leaves root pages alone", () => {
    const profile = addPage(addPage(base(), "1"), "2");
    expect(pruneOrphanPages(profile).pages).toHaveLength(2);
  });
});

describe("v1 -> v2 migration", () => {
  it("keeps every existing page as a root page", () => {
    const v1 = {
      schemaVersion: 1,
      profile: {
        id: "p1",
        name: "Dev",
        pages: [
          { id: "page1", name: "1", buttons: [] },
          { id: "page2", name: "2", buttons: [] },
        ],
      },
    };

    const migrated = migrateProfileDocument(v1);

    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(pagesInLayer(migrated.profile as Profile)).toHaveLength(2);
    for (const page of migrated.profile.pages) {
      expect(page.parentButtonId).toBeUndefined();
    }
  });
});

describe("every page inside a folder has a way out", () => {
  it("gives a page added to a folder its own Back key", () => {
    const { profile, folderButton } = withFolder();

    const withSecond = addPage(profile, "2", folderButton.id);
    const second = pagesInLayer(withSecond, folderButton.id)[1]!;

    expect(second.buttons.map((button) => button.action?.type)).toEqual(["folder.back"]);
    expect(second.buttons[0]!.position).toBe(0);
    expect(second.buttons[0]!.appearance.label).toBe("Back");
  });

  it("gives every page of a folder one, not just the first", () => {
    const { profile, folderButton } = withFolder();
    let updated = addPage(profile, "2", folderButton.id);
    updated = addPage(updated, "3", folderButton.id);

    for (const page of pagesInLayer(updated, folderButton.id)) {
      expect(page.buttons.some((button) => button.action?.type === "folder.back")).toBe(true);
    }
  });

  it("does not put a Back key on root pages", () => {
    const profile = addPage(base(), "1");
    expect(profile.pages[0]!.buttons).toEqual([]);
  });

  it("repairs a folder page that has no Back key", () => {
    const { profile, folderButton, inner } = withFolder();
    // A page inside the folder whose Back key was removed.
    const stripped = {
      ...profile,
      pages: profile.pages.map((page) => (page.id === inner.id ? { ...page, buttons: [] } : page)),
    };

    const repaired = ensureFolderBackKeys(stripped);
    const page = pagesInLayer(repaired, folderButton.id)[0]!;

    expect(page.buttons.map((button) => button.action?.type)).toEqual(["folder.back"]);
  });

  it("adds it at the first free position when position 0 is taken", () => {
    const { profile, folderButton, inner } = withFolder();
    const occupied = {
      ...profile,
      pages: profile.pages.map((page) =>
        page.id === inner.id
          ? {
              ...page,
              buttons: [
                { id: "x", position: 0, appearance: {}, action: { type: "hotkey", config: {} } },
              ],
            }
          : page,
      ),
    };

    const repaired = ensureFolderBackKeys(occupied);
    const back = pagesInLayer(repaired, folderButton.id)[0]!.buttons.find(
      (button) => button.action?.type === "folder.back",
    );

    expect(back?.position).toBe(1);
  });

  it("restores one when the last Back key is cleared, since the page must stay escapable", () => {
    const { profile, inner } = withFolder();

    const cleared = removeButton(profile, inner.id, 0);
    const page = cleared.pages.find((candidate) => candidate.id === inner.id)!;

    expect(page.buttons.some((button) => button.action?.type === "folder.back")).toBe(true);
  });

  it("restores one when the Back key is reassigned to another action", () => {
    const { profile, inner } = withFolder();
    const back = inner.buttons[0]!;

    const reassigned = replaceButton(profile, inner.id, {
      ...back,
      action: { type: "hotkey", config: { keys: ["CTRL", "P"] } },
    });
    const page = reassigned.pages.find((candidate) => candidate.id === inner.id)!;

    expect(page.buttons.filter((button) => button.action?.type === "folder.back")).toHaveLength(1);
    expect(page.buttons.some((button) => button.action?.type === "hotkey")).toBe(true);
  });

  it("leaves a page that already has one untouched", () => {
    const { profile } = withFolder();
    expect(ensureFolderBackKeys(profile)).toEqual(profile);
  });
});
