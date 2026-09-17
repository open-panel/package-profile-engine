import { describe, expect, it } from "vitest";
import type { Button, Profile } from "@open-panel/shared";
import { replaceButton, upsertButton } from "./profile-ops.js";

const button = (position: number, overrides: Partial<Button> = {}): Button => ({
  id: `b${position}`,
  position,
  appearance: {},
  ...overrides,
});

const profileWith = (...buttons: Button[]): Profile => ({
  id: "p1",
  name: "Dev",
  pages: [{ id: "page1", name: "Main", buttons }],
});

const buttonsOf = (profile: Profile) => profile.pages[0]!.buttons;
const at = (profile: Profile, position: number) =>
  buttonsOf(profile).find((b) => b.position === position);

describe("replaceButton", () => {
  it("clears fields the incoming button omits, so an icon or action can be removed", () => {
    const before = profileWith(
      button(0, {
        appearance: { icon: "data:image/png;base64,AAA", label: "Old" },
        action: { type: "shell", config: { command: "ls" } },
      }),
    );

    const after = replaceButton(before, "page1", button(0, { appearance: { label: "New" } }));

    expect(at(after, 0)).toEqual({
      id: "b0",
      position: 0,
      appearance: { label: "New" },
      action: undefined,
    });
  });

  it("does not leak the previous occupant into the slot when two buttons are swapped", () => {
    const a = button(0, {
      appearance: { icon: "icon-a", label: "A" },
      action: { type: "hotkey", config: {} },
    });
    const b = button(1, { appearance: { label: "B" } });
    let profile = profileWith(a, b);

    // The swap the deck performs: source to the target slot, then target back.
    profile = replaceButton(profile, "page1", { ...a, position: 1 });
    profile = replaceButton(profile, "page1", { ...b, position: 0 });

    expect(at(profile, 0)).toMatchObject({ id: "b1", appearance: { label: "B" } });
    expect(at(profile, 0)?.appearance.icon).toBeUndefined();
    expect(at(profile, 0)?.action).toBeUndefined();
    expect(at(profile, 1)).toMatchObject({ id: "b0", appearance: { icon: "icon-a", label: "A" } });
  });

  it("keeps buttons ordered by position and leaves other pages alone", () => {
    const profile: Profile = {
      id: "p1",
      name: "Dev",
      pages: [
        { id: "page1", name: "Main", buttons: [button(2), button(0)] },
        { id: "page2", name: "Git", buttons: [button(0)] },
      ],
    };

    const after = replaceButton(profile, "page1", button(1, { appearance: { label: "Mid" } }));

    expect(after.pages[0]!.buttons.map((b) => b.position)).toEqual([0, 1, 2]);
    expect(after.pages[1]!.buttons).toEqual(profile.pages[1]!.buttons);
  });
});

describe("upsertButton", () => {
  it("still merges partial updates, for callers that only set one field", () => {
    const before = profileWith(
      button(0, {
        appearance: { icon: "icon-a", label: "A" },
        action: { type: "hotkey", config: {} },
      }),
    );

    const after = upsertButton(before, "page1", { position: 0, appearance: { label: "B" } });

    expect(at(after, 0)).toMatchObject({
      appearance: { icon: "icon-a", label: "B" },
      action: { type: "hotkey", config: {} },
    });
  });
});
