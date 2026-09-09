## 1. Frontend status and data

- [x] 1.1 Extract shared equipment wording into `frontend/lib/vehicle-accessibility.ts` and reuse it in the map popup; verify unit cases for `working`, `in_use`, `no_ramp`, `unknown`, and missing data.
- [x] 1.2 Share the existing vehicle SSE feed between `Map.tsx`, `VehiclesLayer`, and the selected sheet; verify map selection, reservation entry, live status updates, missing data, and switching vehicles without a duplicate fleet subscription or stale selection overwrite.
- [x] 1.3 Add the wrapping text-and-SVG equipment label to `VehicleTripSheet`'s header; verify all three equipment labels remain visible above the stop list, including while trip details load or fail.

## 2. Documentation and verification

- [x] 2.1 Update `frontend/AGENTS.md` with the shared feed ownership and presentation helper; verify its paths and descriptions match the implementation.
- [x] 2.2 Add deterministic browser coverage for the header states and both entry points; run `bun run check`, `bun run test`, and `bun run test:e2e --workers=1` in `frontend/` and verify they pass.
- [x] 2.3 Use Playwright MCP to inspect the header at desktop and narrow mobile widths in both themes, capture screenshots and an accessibility snapshot, verify readable status text and an unobstructed close button, then close the test browser and stop any dev server started for the check.
