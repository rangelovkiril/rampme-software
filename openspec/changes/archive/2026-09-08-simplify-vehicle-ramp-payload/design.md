## Context

See `proposal.md` - Why. This is a small, single-module cleanup with no new architecture or dependency; this doc exists mainly to record the one non-obvious decision (what replaces `getVehicleRampInfoFrom`'s return shape) and confirm rollback is trivial.

## Goals / Non-Goals

**Goals:**
- Remove the unused `ramp_reservations` array from the wire contract and the internal type it flows through, with no behavior change to `ramp_status`.

**Non-Goals:**
- Changing `ramp_status`'s existing three values or its derivation rules — untouched by this change.
- Touching `db/ramp.ts` or any reservation-lifecycle logic — this only removes a read-side projection, not the underlying data or its owner.

## Decisions

`getVehicleRampInfoFrom(reservations, hasRamp)` changes its return type from `VehicleRampInfo` (`{ramp_status, reservations}`) to a bare `RampStatus`. Callers (`gtfs/enrich.ts`) drop `ramp_reservations` from `EnrichedVehicle` entirely rather than keeping it as an empty/optional field — there's no partial-deprecation value in a field with zero consumers, and keeping it optional would just preserve the same dead-code question for a future reader.

`getReservationsByVehicle()` (`services/ramp/status.ts`) is unchanged: it's still needed to know whether any reservation on a vehicle is `active` (to distinguish `working` from `in_use`), it just no longer gets serialized back out per-vehicle.

## Risks / Trade-offs

- **[Breaking API change on a public cross-origin endpoint]** → No in-repo consumer reads `ramp_reservations` (confirmed by search across `frontend/`); an undiscovered external consumer would break, but the field was never documented as part of a stable contract. Accepted.

## Migration Plan

Plain revert. No data migration, no feature flag: the field is dropped from both the backend response and the frontend type in the same change, and nothing downstream depended on its presence.
