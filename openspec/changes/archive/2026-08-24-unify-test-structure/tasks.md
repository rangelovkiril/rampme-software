## 1. Frontend

- [x] 1.1 Create `frontend/test/lib/` and move `frontend/lib/config.test.ts` and `frontend/lib/ramp-updates.test.ts` there, updating their relative imports (`./config` → `../../lib/config`, `./ramp-updates` → `../../lib/ramp-updates`, `./types` → `../../lib/types`); verify with `bun run test` (from `frontend/`) passing against the new paths.
- [x] 1.2 Update `frontend/package.json`'s `"test"` script from `bun test lib` to scope over the new `test/` root instead; verify `bun run test` still runs both moved files and nothing under `e2e/` is picked up.
- [x] 1.3 Update `frontend/AGENTS.md`'s testing section (the `bun run test # bun:test, files under lib/ (currently just config.ts)` line and the directory tree at the top) to describe the mirrored `test/` layout, matching how `backend/AGENTS.md` documents its own `test/` tree.
- [x] 1.4 Run `bun run check` in `frontend/` and confirm it's clean after the move.

## 2. Backend

- [x] 2.1 Add the DI-factory / pure-function testability guidance from design.md's Decisions section to `backend/AGENTS.md`'s Rules section, framed as a heuristic (fluid, not a mechanical checklist) with `createRampBridge`/`computeRampUpdate` as the worked examples.

## 3. Root

- [x] 3.1 Add a short pointer in the root `AGENTS.md`'s testing callout (the `> [!IMPORTANT]` block) to the DI-factory / pure-function heuristic living in `backend/AGENTS.md`, so it's discoverable from the top-level doc without duplicating the text.
