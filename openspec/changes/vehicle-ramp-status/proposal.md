## Why

The vehicle trip sheet offers ramp reservations without showing whether the selected vehicle has a ramp. Issue #113 requires that information at the point where the rider decides to reserve, using the same wording as the map.

## What Changes

- Display a readable ramp-equipment status in the trip-sheet header: `С рампа`, `Без рампа`, or `Достъпност неизвестна`.
- Share the status wording between the sheet and map popup; use text alongside a decorative SVG icon in the header.
- Resolve the selected vehicle from the existing live vehicle feed, including when the sheet opens from a reservation with only a vehicle ID.
- Keep equipment status distinct from reservation state: both `working` and `in_use` mean equipped, not necessarily available for immediate deployment.
- Cover the header in deterministic desktop/mobile browser tests, including unavailable data and vehicle switching.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ramp/vehicle-accessibility`: expose the vehicle's equipment status in the trip-sheet header as well as on the map.

## Impact

- `frontend/components/sheets/VehicleTripSheet.tsx`: header status.
- `frontend/components/Map.tsx` and `frontend/components/layers/VehiclesLayer.tsx`: share the existing vehicle feed with the selected sheet.
- `frontend/lib/vehicle-accessibility.ts`: shared presentation labels.
- `frontend/e2e/` and `frontend/test/lib/`: regression coverage.
- `frontend/AGENTS.md`: document the shared vehicle feed and presentation helper.
- No API, MQTT, environment-variable, deployment, or dependency changes.
