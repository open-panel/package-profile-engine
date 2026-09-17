/**
 * Rewrites the retired `page.first` / `page.last` actions as `change-page`.
 *
 * Those were separate actions; picking the first or the last page is now done
 * in "Go to Page", whose picker marks which page is which. A stored key must
 * keep working, so each one is pointed at the page it would have jumped to:
 * the first or last page of the layer the key sits in.
 *
 * Runs in the v2 -> v3 content migration, on raw (not yet validated) JSON, so
 * anything unrecognised is left exactly as it was.
 */

const FIRST_PAGE_ACTION = "page.first";
const LAST_PAGE_ACTION = "page.last";
const CHANGE_PAGE = "change-page";

interface RawButton {
  action?: { type?: unknown; config?: unknown } | null;
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
  const usable = pages.every(
    (page) => page && typeof page === "object" && typeof (page as RawPage).id === "string",
  );
  return usable ? (pages as RawPage[]) : undefined;
}

export function convertFirstLastPageActions<T>(profile: T): T {
  const pages = pagesOf(profile);
  if (!pages) return profile;

  const needsWork = pages.some((page) =>
    (Array.isArray(page.buttons) ? (page.buttons as RawButton[]) : []).some(
      (button) =>
        button.action?.type === FIRST_PAGE_ACTION || button.action?.type === LAST_PAGE_ACTION,
    ),
  );
  if (!needsWork) return profile;

  const rewritten = pages.map((page) => {
    const buttons = Array.isArray(page.buttons) ? (page.buttons as RawButton[]) : [];
    // The jump was always within the key's own layer.
    const layer = pages.filter((candidate) => candidate.parentButtonId === page.parentButtonId);
    const first = layer[0]?.id;
    const last = layer[layer.length - 1]?.id;

    return {
      ...page,
      buttons: buttons.map((button) => {
        const type = button.action?.type;
        if (type !== FIRST_PAGE_ACTION && type !== LAST_PAGE_ACTION) return button;
        const pageId = type === FIRST_PAGE_ACTION ? first : last;
        if (typeof pageId !== "string") return button;
        return { ...button, action: { type: CHANGE_PAGE, config: { pageId } } };
      }),
    };
  });

  return { ...(profile as object), pages: rewritten } as T;
}
