## 1. Backend

- [x] 1.1 Add a comment above `routes/ramp.ts`'s `t.Object({ vehicle_id, stop_id, type })` schema naming `frontend/contexts/RampContext.tsx`'s request body and `frontend/e2e/fixtures/transit.ts`'s mock assertion as the other two places this shape is hand-written, and to keep all three in sync when it changes

## 2. Frontend

- [x] 2.1 Add a comment above `RampContext.tsx`'s `JSON.stringify({ vehicle_id: vehicleId, stop_id: stopId, type })` call naming `backend/src/routes/ramp.ts`'s TypeBox schema and `frontend/e2e/fixtures/transit.ts`'s mock assertion as the other two places this shape is hand-written
- [x] 2.2 Add a comment above `frontend/e2e/fixtures/transit.ts`'s `reserveRequests` mock assertion naming the same two sites

## 3. Verification

- [x] 3.1 Run `bun run check` in both `backend/` and `frontend/` and confirm both pass (comment-only change, no behavior to test)
