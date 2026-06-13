# AI Agent Instructions for LabFlow HR

This file acts as the primary configuration and ruleset for AI coding agents operating within this repository. **You must strictly adhere to these guidelines for all tasks unless explicitly overridden by the user prompt.**

## 1. Codebase Structure & Execution Context
*   **Root Directory:** Contains the web application (React/Vite/Tailwind) and the Node.js/Express backend (`server/`).
*   **Mobile Directory:** `/mobile` contains a standalone React Native (Expo) app. Do not apply Web ARIA attributes here; use React Native `accessibilityLabel`/`accessibilityRole`.
*   **Package Manager:** The project uses `npm` (with `package-lock.json`). Be aware the dev environment often lacks internet access resulting in `ETIMEDOUT` errors for `npm install`. Use `npm rebuild` or `--legacy-peer-deps` to handle dependencies locally when possible. 
*   **TypeScript:** Node v22.22.1 supports running simple scripts via `--experimental-strip-types`.

## 2. Coding Standards & Health
*   **Error Blocks:** Use `catch { ... }` omitting the variable if unused to avoid linter warnings.
*   **Booleans:** Treat boolean fields (like settings toggles) as numbers (`0` for false, `1` for true) in database and state layers.
*   **Dates:** Format standard dates as 'YYYY-MM-DD' using `Intl.DateTimeFormat` with the 'en-CA' locale.
*   **PR Standards:**
    *   Performance PRs: Title `⚡ [description]`, Body must include What, Why, and Measured Improvement.
    *   Refactoring PRs: Title `🧹 [description]`, Body must include What, Why, Verification, and Result.
*   **Line Endings:** Be aware `server` files often use CRLF; ensure `grep` or regex updates account for this.
*   **Cleanup:** Remove any leftover action/script files created for debugging or text manipulation before final submission.

## 3. Architecture Rules
*   **Timezone Isolation (Critical):** Backend logic must exclusively use UTC `Date` objects and formatter logic to prevent local Node server timezone leakage. Ensure Mobile UI relies on backend `serverTimezone` offsets and UTC ISO strings, never hardcoded device timezones.
*   **Shadow Clocks (Mobile Anti-Cheat):** `setInterval` is fully permitted for high-frequency live tracking (like clocks and timers) provided that it updates its state directly and atomically by pulling from our central monotonic clock utility `getMobileNow()` (which leverages native hardware `performance.now()`). Explicitly ban manual pointer arithmetic increments (`shadowTimeRef += 1000`) because mobile OS background throttling causes severe drift and triggers false anti-cheat tamper alerts.
*   **Caching Strategy:** Default to Explicit Invalidation over TTL caching. Use module-scoped memory for rarely changed high-frequency settings (like company timezone) with short TTLs. Always implement caching mechanisms as Shared Utilities (e.g., `server/utils/cache.ts`).
*   **Logging:** Use standard JSON HTTP error returns (Status 500) combined with `console.error` for backend crashes. In Mobile/Prod, implement "Silent Failure by Design" for intentional skips and remove `console.log/warn` completely.
*   **File Deletion:** Always explicitly `fs.unlink()` old uploaded files (avatars, logos) before persisting new paths to prevent orphan files.

## 4. Performance Rules
*   **N+1 Queries:** Never use N+1 queries. Utilize bulk `IN (...)` fetching, followed by O(1) in-memory `Map` lookups. Chunk `IN` clauses at 500-900 to prevent SQLite variable limits.
*   **Database Mutation:** Resolve bulk updates by capturing `RETURNING *` data in a single transaction loop, or construct a dynamic `CASE` statement to execute in a single `.run()` call. 
*   **Processing Efficiency:**
    *   For small string matching, use sequential strict equality (`===`) checks (optimized by V8) over `Set` or dictionary lookups.
    *   Mutate data arrays in place instead of mapping intermediate arrays to reduce Garbage Collection pressure.
*   **Module Initialization:** Hoist `Intl.DateTimeFormat` instances and `better-sqlite3` prepared statements out of loops/functions into module-scoped caches.

## 5. Testing & Benchmarking Rules
*   **Testing Philosophy:** Prioritize Integration Tests via Supertest. Unit tests are reserved exclusively for pure, logic-only functions that lack database connection.
*   **Test Isolation:** Ensure tests clean up strictly (e.g., `DELETE FROM payrolls;`) in `afterEach` hooks using `db.exec`.
*   **Mocking State:** Reuse existing mock data structures in the file. When spying on DB preparation for forced 500 errors, bind the spy correctly to only throw on specific target queries.
*   **Benchmark Standards:**
    *   Path: `server/benchmarks/benchmark_[entity]_[optimization_type].ts`.
    *   Warmup: Loop baseline and target logic 50-100 times before `performance.now()` timing begins.
    *   Mandatory Output format: Must precisely log `Improvement: [X]%` and `Correctness Check: PASS` for dashboard parsing.
    *   Never modify the designated unoptimized `Slow` baseline functions in these files.

## 6. Agent Environment Integrations & Tooling

To maximize AI agent capabilities and ensure project stability, the following environment integrations, custom skills, and automated hooks should be configured for this workspace.

### A. Recommended MCP Servers
*   **Playwright MCP Server (`playwright`)**: 
    *   **Why**: The project heavily utilizes `@playwright/test` for E2E web testing. 
    *   **Usage**: Enables the agent to programmatically open the web app, inspect DOM elements, take screenshots, and visually verify UI/UX functionality without leaving the terminal context.
*   **SQLite Database Server (`sqlite`)**: 
    *   **Why**: The backend is powered by `better-sqlite3` and heavily relies on atomic transactions (`labflow.db`).
    *   **Usage**: Allows agents to run direct read-only SQL queries to verify test seed data, check schema structures, and validate that `RETURNING *` data mutations worked correctly without having to write temporary scripts.

### B. Required Agent Skills
*   **Android CLI Orchestrator (`android-cli`)**:
    *   **Why**: The `/mobile` directory contains a React Native (Expo SDK 55) application. 
    *   **Usage**: Equips the agent with the ability to launch Android emulators, clear Expo caches, analyze device logs (Logcat) for native crashes, and manage SDK versions when debugging mobile-specific features like background location tracking or SQLite persistence.

### C. Automated Hooks (Git / CI)
To maintain the strict architectural rules outlined above, implement the following hooks (via Husky & lint-staged):
*   **Pre-commit (Code Health & Correctness)**:
    *   **Type-checking**: Enforce `npm run lint` (`tsc --noEmit`) to catch type drifts between the Express API and React clients.
    *   **Fast Unit Tests**: Trigger `npm run test` (Jest) to ensure pure functions, UTC offset calculators, and module-scoped caches are not broken by regressions. Note: tests must be run with `--runInBand` to prevent SQLite `SQLITE_BUSY` locking errors.
*   **Pre-push (Performance & Integrity)**:
    *   **Benchmarking**: Automate `npm run bench` to execute `server/benchmarks/runAll.ts`. The push should fail if the output does not strictly contain `Correctness Check: PASS` or if performance significantly drops.

### D. Essential CLI Commands & Workflow Flags
*   **Backend Iteration**: Use `npm run dev` (`tsx server.ts`) for rapid development, leveraging native TypeScript execution.
*   **Mobile Iteration**: Use `npx expo start --clear` to reset Metro bundler caches when Native modules or `expo-sqlite` schemas change.
*   **Testing Hooks**: When running Supertest integration tests, use `--runInBand` with Jest to prevent SQLite `SQLITE_BUSY` locking errors since tests rely on shared DB mutation and cleanup mechanisms.