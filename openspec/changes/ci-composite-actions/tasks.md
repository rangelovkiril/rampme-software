## 1. Composite actions

- [x] 1.1 Create `.github/actions/setup-bun/action.yaml` (checkout + `oven-sh/setup-bun` + `bun.lock`-keyed cache + `bun install --frozen-lockfile`), parameterized by a `working-directory` input, and verify it produces the same cache key shape as today's inline steps
- [x] 1.2 Create `.github/actions/bun-check-and-test/action.yaml` (`bunx biome check .` + `bunx tsc --noEmit` + `bun test --coverage --coverage-reporter=text --reporter=junit --reporter-outfile=junit.xml` + `mikepenz/action-junit-report`), parameterized by `working-directory` and `check-name` inputs. Also took a `test-path` input (default empty), since frontend's `bun test` step passes a positional `test` path argument that backend/hw-sim don't.

## 2. Backend workflow

- [x] 2.1 Replace `backend.yaml`'s `check` job steps with calls to `setup-bun` and `bun-check-and-test` (`working-directory: backend`, `check-name: "Backend tests"`) and verify a CI run on this branch is green with identical step output to before

## 3. hw-sim workflow

- [x] 3.1 Replace `hw-sim.yaml`'s `check` job steps with calls to `setup-bun` and `bun-check-and-test` (`working-directory: hw-sim`, `check-name: "hw-sim tests"`) and verify a CI run is green

## 4. Frontend workflow

- [ ] 4.1 Replace `frontend.yaml`'s `build` job steps with calls to `setup-bun` and `bun-check-and-test` (`working-directory: frontend`, `check-name: "Frontend tests"`), keeping `bun run build` and the `upload-artifact` step as-is after them, and verify a CI run is green
- [ ] 4.2 Replace `frontend.yaml`'s `e2e` job's setup steps (checkout through `bun install`) with a call to `setup-bun` only, leaving the Playwright install/run/report steps untouched, and verify a CI run is green

## 5. Verification

- [ ] 5.1 Confirm all three workflows' JUnit report `check_name`s and PR-diff annotations still appear exactly as before (`Backend tests`, `Frontend tests`, `hw-sim tests`) on a PR that touches all three apps
