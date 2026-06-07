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