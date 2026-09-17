import { FOLDER_BACK_ACTION, FOLDER_OPEN_ACTION } from "@open-panel/shared";

/**
 * Upgrades "folders" made before pages could nest.
 *
 * An earlier build expressed a folder with the only primitive it had: a
 * `change-page` key pointing at an ordinary page, and a `change-page` key on
 * that page pointing back. Those pages are root pages, so they show up in the
 * page selector and in next/previous navigation — which is exactly what a
 * folder's pages must not do.
 *
 * Runs inside the v1 -> v2 content migration, on raw (not yet validated) JSON,
 * so every step is defensive and anything unrecognised is left untouched.
 *
 * The signature is deliberately narrow, because a pair of `change-page` keys is
 * also how someone might hand-build a menu:
 *
 *  - exactly one key anywhere points at the page (a folder has one entrance);
 *  - that key is on a different page;
 *  - the page points back at the page holding that key (the Back key);
 *  - the page is not the profile's first page, and candidates are considered
 *    last-first: the pair of keys is symmetric, so direction comes from page
 *    order — a profile always starts with one page, and the earlier build
 *    appended a folder's page after it;
 *  - the link cannot make a page its own ancestor, and at least one root page
 *    must survive — otherwise the device would have nowhere to boot into.
 */

const CHANGE_PAGE = "change-page";

interface RawButton {
  id?: unknown;
  action?: { type?: unknown; config?: { pageId?: unknown } } | null;
}

interface RawPage {
  id?: unknown;
  buttons?: unknown;
  parentButtonId?: unknown;
}

function pagesOf(profile: unknown): RawPage[] | undefined {
  if (!profile || typeof profile !== "object") return undefined;
  const pages = (profile as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return undefined;
  if (
    !pages.every(
      (page) => page && typeof page === "object" && typeof (page as RawPage).id === "string",
    )
  ) {
    return undefined;
  }
  return pages as RawPage[];
}

function buttonsOf(page: RawPage): RawButton[] {
  return Array.isArray(page.buttons) ? (page.buttons as RawButton[]) : [];
}

function changePageTarget(button: RawButton): string | undefined {
  if (button.action?.type !== CHANGE_PAGE) return undefined;
  const target = button.action?.config?.pageId;
  return typeof target === "string" ? target : undefined;
}

/** Walks parentButtonId upwards to check `ancestorPageId` is not reached from `fromPageId`. */
function isDescendantOf(pages: RawPage[], fromPageId: string, ancestorPageId: string): boolean {
  let current = pages.find((page) => page.id === fromPageId);
  const seen = new Set<string>();

  while (current && typeof current.parentButtonId === "string") {
    if (seen.has(current.id as string)) return false;
    seen.add(current.id as string);
    const parentId = current.parentButtonId;
    const parentPage = pages.find((page) =>
      buttonsOf(page).some((button) => button.id === parentId),
    );
    if (!parentPage) return false;
    if (parentPage.id === ancestorPageId) return true;
    current = parentPage;
  }
  return false;
}

export function convertLegacyFolders<T>(profile: T): T {
  const pages = pagesOf(profile);
  if (!pages) return profile;

  // Deep-ish clone: only the fields this touches are rewritten, but the input
  // is a parsed JSON document, so a structural copy is safe and keeps the
  // function pure.
  const working: RawPage[] = JSON.parse(JSON.stringify(pages)) as RawPage[];
  let changed = false;

  for (;;) {
    const converted = convertOne(working);
    if (!converted) break;
    changed = true;
  }

  if (!changed) return profile;
  return { ...(profile as object), pages: working } as T;
}

/** Converts a single legacy folder in place; returns false when none is left. */
function convertOne(pages: RawPage[]): boolean {
  // Last to first, and never the first page: in a mutually linked pair both
  // sides satisfy the signature, and the later page is the folder.
  for (let index = pages.length - 1; index >= 1; index--) {
    const candidate = pages[index]!;
    const candidateId = candidate.id as string;
    if (typeof candidate.parentButtonId === "string") continue; // already nested

    const incoming = pages.flatMap((page) =>
      page.id === candidateId
        ? []
        : buttonsOf(page)
            .filter((button) => changePageTarget(button) === candidateId)
            .map((button) => ({ page, button })),
    );
    if (incoming.length !== 1) continue;

    const { page: entrancePage, button: entranceButton } = incoming[0]!;
    if (typeof entranceButton.id !== "string") continue;

    const backButtons = buttonsOf(candidate).filter(
      (button) => changePageTarget(button) === entrancePage.id,
    );
    if (backButtons.length === 0) continue;

    // Guards: no cycles, and the root layer must not be emptied.
    if (isDescendantOf(pages, entrancePage.id as string, candidateId)) continue;
    const remainingRoots = pages.filter(
      (page) => page.id !== candidateId && typeof page.parentButtonId !== "string",
    );
    if (remainingRoots.length === 0) continue;

    candidate.parentButtonId = entranceButton.id;
    entranceButton.action = { type: FOLDER_OPEN_ACTION, config: {} };
    for (const back of backButtons) back.action = { type: FOLDER_BACK_ACTION, config: {} };
    return true;
  }

  return false;
}
