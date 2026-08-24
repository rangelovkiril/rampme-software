## 1. Fixtures

- [ ] 1.1 Build a small fixture GTFS static ZIP (stops.txt, routes.txt, trips.txt, stop_times.txt, calendar.txt - the files `fetchStaticGtfs()` reads) with a handful of rows, including one route using an extended `route_type` value (e.g. 700-range) and one `stop_time` past `24:00:00`, and check it into `backend/test/fixtures/gtfs-static.zip`
- [ ] 1.2 Write a throwaway script using `protobufjs` + the shipped `proto/gtfs-realtime.proto` descriptor to encode a small fixture `FeedMessage` (one vehicle-position entity, one trip-update entity), and check the encoded bytes into `backend/test/fixtures/gtfs-rt.bin`

## 2. Backend extraction

- [ ] 2.1 Extract a pure `parseGtfsZip(buf: ArrayBuffer): GtfsData` from `fetchStaticGtfs()` in `backend/src/gtfs/static.ts`, with `fetchStaticGtfs()` becoming a thin `fetch()` + `parseGtfsZip()` wrapper, and verify `bun run check` passes with no behavior change
- [ ] 2.2 Extract the decode step from `fetchFeed()` in `backend/src/gtfs/realtime.ts` into a directly-callable function taking raw bytes, with `fetchFeed()` becoming a thin `fetch()` wrapper around it, and verify `bun run check` passes with no behavior change

## 3. Backend tests

- [ ] 3.1 Add `backend/test/gtfs/static.test.ts` covering `parseGtfsZip()` against the fixture ZIP: correct stop/route/trip counts, `normalizeRouteType`'s extended-type mapping, and the GTFS 24+ hour `stop_time` landing in the expected structure
- [ ] 3.2 Add `backend/test/gtfs/decode.test.ts` covering the extracted decode function against the fixture protobuf bytes: correct entity counts and field values for both trip-updates and vehicle-positions shapes

## 4. Verification

- [ ] 4.1 Run `bun run test` in `backend/` and confirm the new tests pass alongside the existing suite, with no change to `backend/test/gtfs/realtime.test.ts`'s existing cadence coverage
