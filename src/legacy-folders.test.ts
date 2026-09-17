import { describe, expect, it } from "vitest";
import type { Profile } from "@open-panel/shared";
import { convertLegacyFolders } from "./legacy-folders.js";

/**
 * The shape an earlier build produced: a `change-page` key into an ordinary
 * root page, and a `change-page` key on that page pointing back.
 */
const changePage = (id: string, position: number, pageId: string, label?: string) => ({
  id,
  position,
  appearance: label ? { label } : {},
  action: { type: "change-page", config: { pageId } },
});

describe("convertLegacyFolders", () => {
  it("nests the target page under the key that opened it", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root", name: "1", buttons: [changePage("bFolder", 0, "inner", "Folder")] },
        { id: "inner", name: "2", buttons: [changePage("bBack", 0, "root", "Back")] },
      ],
    };

    const converted = convertLegacyFolders(profile);
    const [root, inner] = converted.pages;

    expect(inner!.parentButtonId).toBe("bFolder");
    expect(root!.buttons[0]!.action).toEqual({ type: "folder.open", config: {} });
    expect(inner!.buttons[0]!.action).toEqual({ type: "folder.back", config: {} });
  });

  it("converts several folders on the same page", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        {
          id: "root",
          name: "1",
          buttons: [changePage("b1", 0, "f1", "Folder"), changePage("b2", 1, "f2", "Folder")],
        },
        { id: "f1", name: "2", buttons: [changePage("back1", 0, "root", "Back")] },
        { id: "f2", name: "3", buttons: [changePage("back2", 0, "root", "Back")] },
      ],
    };

    const converted = convertLegacyFolders(profile);

    expect(converted.pages.filter((page) => !page.parentButtonId)).toHaveLength(1);
    expect(converted.pages[1]!.parentButtonId).toBe("b1");
    expect(converted.pages[2]!.parentButtonId).toBe("b2");
  });

  it("converts a folder nested inside a converted folder", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root", name: "1", buttons: [changePage("bOuter", 0, "outer", "Folder")] },
        {
          id: "outer",
          name: "2",
          buttons: [changePage("backOuter", 0, "root"), changePage("bInner", 1, "inner", "Folder")],
        },
        { id: "inner", name: "3", buttons: [changePage("backInner", 0, "outer")] },
      ],
    };

    const converted = convertLegacyFolders(profile);

    expect(converted.pages[1]!.parentButtonId).toBe("bOuter");
    expect(converted.pages[2]!.parentButtonId).toBe("bInner");
    expect(converted.pages.filter((page) => !page.parentButtonId)).toHaveLength(1);
  });

  it("leaves a page alone when more than one key points at it", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root", name: "1", buttons: [changePage("b1", 0, "shared")] },
        { id: "other", name: "2", buttons: [changePage("b2", 0, "shared")] },
        { id: "shared", name: "3", buttons: [changePage("back", 0, "root")] },
      ],
    };

    expect(convertLegacyFolders(profile)).toEqual(profile);
  });

  it("leaves a one-way jump alone: without a way back it is not a folder", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root", name: "1", buttons: [changePage("b1", 0, "target")] },
        { id: "target", name: "2", buttons: [] },
      ],
    };

    expect(convertLegacyFolders(profile)).toEqual(profile);
  });

  it("never empties the root layer, even for a mutual two-page pair", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "a", name: "1", buttons: [changePage("ba", 0, "b")] },
        { id: "b", name: "2", buttons: [changePage("bb", 0, "a")] },
      ],
    };

    const converted = convertLegacyFolders(profile);
    const roots = converted.pages.filter((page) => !page.parentButtonId);

    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "root", name: "1", buttons: [changePage("bFolder", 0, "inner", "Folder")] },
        { id: "inner", name: "2", buttons: [changePage("bBack", 0, "root", "Back")] },
      ],
    };

    const once = convertLegacyFolders(profile);
    expect(convertLegacyFolders(once)).toEqual(once);
  });

  it("passes through anything that is not a recognisable profile", () => {
    expect(convertLegacyFolders({ pages: "nope" })).toEqual({ pages: "nope" });
    expect(convertLegacyFolders(undefined)).toBeUndefined();
    expect(convertLegacyFolders({})).toEqual({});
  });
});
