# @open-panel/profile-engine

Profile/page/button CRUD, zod validation, SQLite persistence and
schema-version migrations for [OpenPanel](https://github.com/open-panel/openPanel).

Requires Node ≥ 22.5 — persistence is built on Node's own built-in
`node:sqlite`, so installing this package never needs a native compiler
toolchain (no `better-sqlite3`-style addon to build).

## Install

```bash
npm install @open-panel/profile-engine
```

## What's in here

- **`openDatabase(path)` / `migrate(db)`** — opens a `node:sqlite` database and
  applies structural migrations, tracked in a `migrations` table so an
  existing database is never silently rewritten outside that list.
- **`ProfileRepository`** — profile persistence and CRUD (`list`, `get`,
  `create`, `save`) against an injected `Db` handle, so it runs equally well
  against an in-memory database in tests.
- **`SettingsRepository`** — key/value settings storage in the same database.
- **Profile operations** — pure functions over a `Profile` value:
  `addPage`, `renamePage`, `movePage`, `deletePage`, `createFolder`,
  `upsertButton`/`replaceButton`/`removeButton`/`findButton`,
  `pagesInLayer`, `findPageContainingButton`, `isFolderButton`,
  `pruneOrphanPages`.
- **Validation** — `validateProfile`/`validateProfileDocument`, and
  `ProfileValidationError`/`UnsupportedProfileVersionError` for the specific
  ways input can be rejected.
- **Migrations & legacy shapes** — `migrateProfileDocument`,
  `convertLegacyFolders`/`normalizeFolders`/`ensureFolderBackKeys`,
  `convertFirstLastPageActions`, for reading profile documents written by
  older schema versions.
- **Import/export** — round-tripping a `Profile` to/from a `ProfileDocument`
  for backup and transfer between machines.

## Usage

```ts
import { openDatabase, migrate, ProfileRepository } from "@open-panel/profile-engine";

const db = openDatabase("./openpanel.sqlite");
migrate(db);

const profiles = new ProfileRepository(db);
const profile = profiles.create({ name: "My Deck" });
```

```ts
import { addPage, upsertButton } from "@open-panel/profile-engine";
import { PROFILE_SCHEMA_VERSION } from "@open-panel/shared";

let profile = addPage(profile, "Page 2");
profile = upsertButton(profile, profile.pages[1].id, {
  position: 0,
  action: { type: "url.open", config: { url: "https://example.com" } },
});
profiles.save({ schemaVersion: PROFILE_SCHEMA_VERSION, profile });
```

## Related packages

- [`@open-panel/shared`](https://www.npmjs.com/package/@open-panel/shared) — the `Profile`/`Page`/`Button` types this package validates and persists

## License

MIT © [OpenPanel contributors](https://github.com/open-panel/package-profile-engine/blob/main/LICENSE)
