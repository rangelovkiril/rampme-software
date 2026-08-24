## 1. Backend fix

- [ ] 1.1 Add `isRampBridgeAvailable()` to `backend/src/services/ramp/bridge.ts`, returning whether `initRampBridge()` has completed, alongside the existing `getRampBridge()`
- [ ] 1.2 Guard the `POST /ramp/reserve` handler in `backend/src/routes/ramp.ts` with `isRampBridgeAvailable()`, skipping `publishNewReservation()` (with a `consola.warn` via the existing `ramp-mqtt` tag) when unavailable, and verify the DB write and HTTP response still succeed
- [ ] 1.3 Guard the `DELETE /ramp/reserve/:id` handler the same way for `publishCancelReservation()`, and verify the DB write and HTTP response still succeed

## 2. Backend tests

- [ ] 2.1 Add a regression test exercising `POST /ramp/reserve` with no bridge initialized, asserting a successful response and that the reservation is retrievable afterward
- [ ] 2.2 Add a regression test exercising `DELETE /ramp/reserve/:id` with no bridge initialized, asserting a successful response and that the reservation's status is `cancelled` afterward
- [ ] 2.3 Confirm existing bridge-connected-path tests (`backend/test/services/ramp/bridge.test.ts`) still pass unchanged, verifying publish behavior is untouched when a bridge is available

## 3. Verification

- [ ] 3.1 Run `bun run test` and `bun run check` in `backend/` and confirm both pass
- [ ] 3.2 Manually start the backend with `MQTT_URL` unset and confirm `POST /ramp/reserve` returns 200 instead of 500, closing out issue #69's acceptance criteria
