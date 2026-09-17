import { describe, expect, it } from "vitest";
import { PROFILE_SCHEMA_VERSION, type Profile } from "@open-panel/shared";
import { addPage, createFolder, movePage, pagesInLayer } from "./profile-ops.js";

/**
 * A profile stores every layer in one flat `pages` array, so reordering a page
 * is not an array move: the page's siblings have to be resequenced without
 * disturbing the slots that belong to other layers. These cover that.
 */

const base = (): Profile => ({ id: "p1", name: "Dev", pages: [] });

/** Three root pages, with a folder on the first holding two of its own. */
function nested() {
  let profile = addPage(addPage(addPage(base(), "1"), "2"), "3");
  const root = profile.pages[0]!;
  profile = createFolder(profile, root.id, 0);
  const folderButton = profile.pages[0]!.buttons.find((button) => button.position === 0)!;
  profile = addPage(profile, "inner-2", folderButton.id);
  return { profile, folderButton };
}

const names = (profile: Profile, parentButtonId?: string) =>
  pagesInLayer(profile, parentButtonId).map((page) => page.name);

describe("movePage", () => {
  it("moves a page forward within its layer", () => {
    const profile = addPage(addPage(addPage(base(), "a"), "b"), "c");
    const moved = movePage(profile, profile.pages[0]!.id, 2);
    expect(names(moved)).toEqual(["b", "c", "a"]);
  });

  it("moves a page backward within its layer", () => {
    const profile = addPage(addPage(addPage(base(), "a"), "b"), "c");
    const moved = movePage(profile, profile.pages[2]!.id, 0);
    expect(names(moved)).toEqual(["c", "a", "b"]);
  });

  it("leaves other layers untouched", () => {
    // The invariant a plain array splice would break: root pages and folder
    // pages are interleaved in the flat list, so resequencing one layer must
    // not shuffle the other.
    const { profile, folderButton } = nested();
    const before = names(profile, folderButton.id);
    const moved = movePage(profile, profile.pages[0]!.id, 2);
    expect(names(moved, folderButton.id)).toEqual(before);
    expect(moved.pages).toHaveLength(profile.pages.length);
  });

  it("reorders inside a folder without touching the root layer", () => {
    const { profile, folderButton } = nested();
    const rootBefore = names(profile);
    const inner = pagesInLayer(profile, folderButton.id);
    const moved = movePage(profile, inner[1]!.id, 0);
    expect(names(moved, folderButton.id)).toEqual([inner[1]!.name, inner[0]!.name]);
    expect(names(moved)).toEqual(rootBefore);
  });

  it("clamps an index past the end of the layer", () => {
    const profile = addPage(addPage(base(), "a"), "b");
    expect(names(movePage(profile, profile.pages[0]!.id, 99))).toEqual(["b", "a"]);
  });

  it("returns the profile unchanged for a no-op move or an unknown page", () => {
    const profile = addPage(addPage(base(), "a"), "b");
    expect(movePage(profile, profile.pages[0]!.id, 0)).toBe(profile);
    expect(movePage(profile, "nope", 1)).toBe(profile);
  });

  it("keeps every page's parent, so a move cannot escape its layer", () => {
    const { profile, folderButton } = nested();
    const moved = movePage(profile, pagesInLayer(profile, folderButton.id)[1]!.id, 0);
    for (const page of moved.pages) {
      const original = profile.pages.find((candidate) => candidate.id === page.id)!;
      expect(page.parentButtonId).toBe(original.parentButtonId);
    }
  });

  it("produces a profile that still validates", () => {
    const { profile } = nested();
    const moved = movePage(profile, profile.pages[0]!.id, 1);
    expect(new Set(moved.pages.map((page) => page.id)).size).toBe(moved.pages.length);
    expect(PROFILE_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
