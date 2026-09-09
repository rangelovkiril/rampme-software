## Context

See proposal.md for the problem tracked by #113. `VehiclesLayer` owns the vehicle SSE subscription and has a private label helper. `Map.tsx` passes a clicked vehicle to `VehicleTripSheet`, but reservation entry points initially pass only an ID. Trip details do not contain equipment status. A header reading only its current prop would remain unknown for those entry points and stale after a live update.

## Goals / Non-Goals

**Goals:** Show accurate equipment wording for both entry points, reuse the existing vehicle feed, and fit the existing light/dark header layout.

**Non-Goals:** Redesign map markers or the legend (#114), change reservation eligibility/proximity (#120), fix global theme switching, or change hardware availability reporting. These are separate issues.

## Decisions

1. Move the existing vehicle SSE subscription to `Map.tsx` and pass its array to `VehiclesLayer`. Resolve the selected ID against that same array before rendering the sheet. This keeps one fleet subscription and avoids adding one HTTP request or SSE subscription per sheet. Keep selection independent from feed membership so a missing vehicle does not unexpectedly close the sheet; missing equipment information is unknown. Prevent delayed vehicle-open responses from replacing a newer selection.

2. Extract equipment text into `frontend/lib/vehicle-accessibility.ts`, typed from the backend's schema-derived `RampStatus`. Both `working` and `in_use` map to `С рампа`; `no_ramp` maps to `Без рампа`; unknown or missing status maps to `Достъпност неизвестна`. The existing map popup consumes the same wording. A separate hardcoded header map was rejected because it would drift from the popup.

3. Add a wrapping status line below the header's destination/vehicle metadata. Use readable theme text, a subtle surface/border, and a decorative SVG icon with `aria-hidden`. Do not truncate the status or use an emoji as its label. The header remains outside the scrolling stop list, and existing measurements include its added height. Equipment is a factual label, not a green success confirmation for deployment.

4. Use deterministic API fixtures for browser verification. Cover all four API literals, both entry points, missing data, and changing vehicles. Verify a narrow mobile viewport and both theme classes. Run browser tests with one worker and the existing webpack dev-server configuration to limit concurrent load on this machine.

## Risks / Trade-offs

- Feed ownership moves up one component → preserve layer culling, selection/follow behaviour, and a single SSE connection in regression checks.
- Long Bulgarian status text increases header height → allow wrapping and verify mobile sheet sizing and close-button visibility.
- Equipment status does not prove hardware connectivity or deployment → retain factual wording and existing reservation behaviour.
- Playwright MCP is configured but not callable in the current session → reconnect the editor host before interactive visual verification; do not claim unperformed checks.

## Migration Plan

No data migration or coordinated backend deployment is needed. Publish through the existing frontend pipeline after checks and review. Rollback is a plain revert of the frontend change; there are no environment-variable, API, or MQTT changes.
