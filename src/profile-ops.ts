import { randomUUID } from "node:crypto";
import {
  FOLDER_BACK_ACTION,
  FOLDER_OPEN_ACTION,
  type Button,
  type Page,
  type Profile,
} from "@open-panel/shared";

/**
 * Pure, side-effect-free operations on the in-memory Profile shape. The daemon
 * calls these, then persists the result through ProfileRepository — keeping
 * this logic out of the UI (specs.md Rule 2) and out of the storage layer.
 */

/**
 * Adds a page to one layer: the root layer, or the layer behind `parentButtonId`
 * (the button that acts as a folder).
 *
 * A page inside a folder is created with a Back key, because a folder page
 * without one is a dead end on the hardware: `folder.back` is the only thing
 * that leaves a layer, so every page of that layer needs its own.
 */
export function addPage(profile: Profile, name: string, parentButtonId?: string): Profile {
  const page: Page = {
    id: randomUUID(),
    name,
    buttons: parentButtonId ? [backKey(0)] : [],
    parentButtonId,
  };
  return { ...profile, pages: [...profile.pages, page] };
}

function backKey(position: number): Button {
  return {
    id: randomUUID(),
    position,
    appearance: { label: "Back" },
    action: { type: FOLDER_BACK_ACTION, config: {} },
  };
}

/** Position 0 by convention, so Back sits in the same place on every page of a folder. */
function firstFreePosition(page: Page): number | undefined {
  const taken = new Set(page.buttons.map((button) => button.position));
  for (let position = 0; position < 64; position++) {
    if (!taken.has(position)) return position;
  }
  return undefined;
}

/**
 * The two folder invariants, applied after any write that can break them:
 * nothing unreachable is kept, and nothing reachable is a dead end.
 */
export function normalizeFolders(profile: Profile): Profile {
  return ensureFolderBackKeys(pruneOrphanPages(profile));
}

/**
 * Gives every page inside a folder a Back key if it has none — repairing pages
 * that predate that rule, and folders whose pages were added before it.
 *
 * Only ever adds, never moves or removes: a full page is left alone rather than
 * overwriting something to make room. Removing the last Back key from a folder
 * page brings one back on the next write, which is why the editor disables that
 * Remove instead of letting it look like it worked.
 */
export function ensureFolderBackKeys(profile: Profile): Profile {
  return {
    ...profile,
    pages: profile.pages.map((page) => {
      if (!page.parentButtonId) return page;
      if (page.buttons.some((button) => button.action?.type === FOLDER_BACK_ACTION)) return page;

      const position = firstFreePosition(page);
      if (position === undefined) return page;
      return {
        ...page,
        buttons: [...page.buttons, backKey(position)].sort((a, b) => a.position - b.position),
      };
    }),
  };
}

/** The pages of one layer, in order. `undefined` is the profile's root layer. */
export function pagesInLayer(profile: Profile, parentButtonId?: string): Page[] {
  return profile.pages.filter((page) => page.parentButtonId === parentButtonId);
}

/** The page a button sits on — how "go back out of this folder" is resolved. */
export function findPageContainingButton(profile: Profile, buttonId: string): Page | undefined {
  return profile.pages.find((page) => page.buttons.some((button) => button.id === buttonId));
}

/** True when this button has a layer of its own behind it. */
export function isFolderButton(profile: Profile, buttonId: string): boolean {
  return profile.pages.some((page) => page.parentButtonId === buttonId);
}

/**
 * Drops pages whose parent button no longer exists, repeatedly, so deleting a
 * folder (or the page a folder button lived on) cannot leave unreachable pages
 * behind at any depth.
 */
export function pruneOrphanPages(profile: Profile): Profile {
  let pages = profile.pages;
  for (;;) {
    // Reachable means: the parent button still exists AND is still a folder.
    // Reassigning a folder key to some other action makes its pages as
    // unreachable as deleting the key would.
    const folderIds = new Set(
      pages.flatMap((page) =>
        page.buttons
          .filter((button) => button.action?.type === FOLDER_OPEN_ACTION)
          .map((button) => button.id),
      ),
    );
    const kept = pages.filter((page) => !page.parentButtonId || folderIds.has(page.parentButtonId));
    if (kept.length === pages.length) return { ...profile, pages };
    pages = kept;
  }
}

/**
 * Turns a button into a folder: one page behind it, holding a key that goes
 * back out. Lives here rather than in the desktop app so the invariant "a
 * folder always has at least one page, and that page is escapable" is enforced
 * wherever folders are created (specs.md Rule 2 — no business logic in the UI).
 */
export function createFolder(profile: Profile, pageId: string, position: number): Profile {
  const page = profile.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`Page not found: ${pageId}`);

  const existing = page.buttons.find((button) => button.position === position);
  const folderButtonId = existing?.id ?? randomUUID();

  const withFolderButton = replaceButton(profile, pageId, {
    id: folderButtonId,
    position,
    appearance: { ...existing?.appearance, label: existing?.appearance.label || "Folder" },
    action: { type: FOLDER_OPEN_ACTION, config: {} },
  });

  // addPage seeds the Back key, so there is one definition of what a folder
  // page must contain.
  return addPage(withFolderButton, "1", folderButtonId);
}

export function renamePage(profile: Profile, pageId: string, name: string): Profile {
  return {
    ...profile,
    pages: profile.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
  };
}

/**
 * Moves a page to a new index *within its own layer*.
 *
 * Pages are identified by position and a profile stores every layer in one
 * flat list, so reordering has to splice the page among its siblings and then
 * write that order back into the flat list without disturbing any other
 * layer's pages — which is why this cannot be a plain array move.
 */
export function movePage(profile: Profile, pageId: string, toIndex: number): Profile {
  const page = profile.pages.find((candidate) => candidate.id === pageId);
  if (!page) return profile;

  const layer = profile.pages.filter(
    (candidate) => candidate.parentButtonId === page.parentButtonId,
  );
  const from = layer.findIndex((candidate) => candidate.id === pageId);
  const to = Math.max(0, Math.min(toIndex, layer.length - 1));
  if (from === to) return profile;

  const reordered = [...layer];
  reordered.splice(from, 1);
  reordered.splice(to, 0, page);

  // Walk the flat list and hand back the layer's slots in their new order,
  // leaving every other layer's page exactly where it was.
  let slot = 0;
  return {
    ...profile,
    pages: profile.pages.map((candidate) =>
      candidate.parentButtonId === page.parentButtonId ? reordered[slot++]! : candidate,
    ),
  };
}

export function deletePage(profile: Profile, pageId: string): Profile {
  // Pruning is what removes the deleted page's folders, and their folders.
  return normalizeFolders({
    ...profile,
    pages: profile.pages.filter((p) => p.id !== pageId),
  });
}

export function upsertButton(
  profile: Profile,
  pageId: string,
  button: Partial<Button> & { position: number },
): Profile {
  return {
    ...profile,
    pages: profile.pages.map((page) => {
      if (page.id !== pageId) return page;
      const existingIndex = page.buttons.findIndex((b) => b.position === button.position);
      const merged: Button = {
        id: button.id ?? page.buttons[existingIndex]?.id ?? randomUUID(),
        position: button.position,
        appearance: { ...page.buttons[existingIndex]?.appearance, ...button.appearance },
        action: button.action ?? page.buttons[existingIndex]?.action,
      };
      const buttons = [...page.buttons];
      if (existingIndex >= 0) buttons[existingIndex] = merged;
      else buttons.push(merged);
      return { ...page, buttons };
    }),
  };
}

/**
 * Replaces the button at `button.position` wholesale, dropping whatever was
 * stored there.
 *
 * Deliberately distinct from upsertButton: the IPC setButton call carries a
 * complete, validated Button, so a field the caller left out means "clear it".
 * Merging instead makes two edits impossible — removing a button's icon, and
 * unassigning its action — and leaks the previous occupant's icon or action
 * into the slot when two buttons are swapped through it.
 */
export function replaceButton(profile: Profile, pageId: string, button: Button): Profile {
  return normalizeFolders({
    ...profile,
    pages: profile.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            buttons: [...page.buttons.filter((b) => b.position !== button.position), button].sort(
              (a, b) => a.position - b.position,
            ),
          }
        : page,
    ),
  });
}

export function removeButton(profile: Profile, pageId: string, position: number): Profile {
  return normalizeFolders({
    ...profile,
    pages: profile.pages.map((page) =>
      page.id === pageId
        ? { ...page, buttons: page.buttons.filter((b) => b.position !== position) }
        : page,
    ),
  });
}

export function findButton(profile: Profile, pageId: string, position: number): Button | undefined {
  return profile.pages.find((p) => p.id === pageId)?.buttons.find((b) => b.position === position);
}
