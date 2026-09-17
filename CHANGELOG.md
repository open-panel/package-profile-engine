# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0]

### Added

- `ProfileRepository`/`SettingsRepository` on top of Node's built-in
  `node:sqlite` — no native addon to compile.
- Structural, tracked schema migrations.
- Profile/page/button CRUD operations (add/rename/move/delete page,
  upsert/replace/remove/find button, folders).
- Validation (`validateProfile`/`validateProfileDocument`) and legacy-shape
  migration helpers.
- Profile document import/export.
