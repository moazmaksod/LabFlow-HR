# Project Memory Report

This document compiles all known conventions, rules, and architectural guidelines established for this repository.

## 1. Coding & Naming Conventions
*   **Error Handling:** Use the `catch { ... }` syntax (omitting the error variable) when the error object is not used to prevent linting warnings.
*   **Logging (Backend):** In controllers (e.g., `payrollController.ts`), use `console.error('Error in [FunctionName]:', error);` and return specific JSON error messages (e.g., `Failed to fetch payroll records`) with a 500 status code.
*   **Logging (Mobile/Prod):** Completely remove `console.log` and `console.warn` for normal business logic. Keep `console.error` for critical failures. Implement "Silent Failure by Design" with explanatory comments.
*   **Refactoring Signatures:** When updating function signatures, append new parameters as optional to maintain backward compatibility.
*   **Boolean Representation:** Boolean flags (settings, toggles) are typically represented as numbers (`0` for false, `1` for true) in state and the database.
*   **Line Endings:** Source files in the `server` directory frequently use CRLF (Windows) line endings. Ensure text manipulation accounts for this.
*   **Utility Formatting:** `formatStatusLabel` returns 'Unknown' for falsy values and converts snake_case or space-separated strings to Title Case.
*   **Date Strings:** Use the 'en-CA' locale with `Intl.DateTimeFormat` to produce 'YYYY-MM-DD' formatted date strings (e.g., in `server/utils/dateUtils.ts`).
*   **PR Titles/Descriptions:** 
    *   Performance optimizations: `⚡ [description]` detailing What, Why, and Measured Improvement.
    *   Refactoring: `🧹 [description]` with What, Why, Verification, and Result.

## 2. Architecture Rules & Patterns
*   **Caching Strategy:** Implement caching mechanisms as Shared Utilities (e.g., `server/utils/cache.ts`). Exception: Small performance fixes can use lightweight module-scoped caching directly within the controller.
    *   *Config Caching:* Prefer Explicit Invalidation over TTL caching. For highly queried static settings like `company_timezone`, use a module-scoped memory variable with a short TTL (e.g., 5 mins).
*   **Timezone Isolation & Management:** 
    *   Backend logic MUST strictly use UTC `Date` objects combined with `Intl.DateTimeFormat` configurations to prevent server timezone leakage.
    *   Treat localized DB timestamps securely as floating time using UTC parse/format methods (enforcing 'Z' ISO suffixes).
    *   All web and mobile client views must render and format timestamps dynamically using the employee's chosen preference field: `user?.display_timezone`. The system fallback hierarchy must follow: User Preference (`display_timezone`) -> Device Default Clock -> UTC. The backend `serverTimezone` should only serve as an ultimate system backup.
*   **Live Server Clocks & Anti-Cheat:** 
    *   Mobile UI MUST NEVER rely on `setInterval` manual incrementing (fails with OS sleep debt). 
    *   Use our verified zero-drift monotonic sync pattern: The live state hook must sync safely every second directly via `new Date(getMobileNow())`.
    *   Trigger hard blocks if expected OS time drifts against shadow time.
    *   Format dynamic clocks reacting to the database `serverTimezone`. Implement native Pull-to-Refresh for manual re-syncing.
*   **File Storage:** Replace uploaded files (avatars, logos) by systematically finding and explicitly deleting the old file via `fs.unlink` before persisting the new path. Avatars are in `public/uploads`, logos in `public/uploads/logos`.
*   **Multer Security:** Always configure `limits` (e.g., `fileSize`) and `fileFilter` for Multer. Handle specific Multer exceptions (400 Bad Request) explicitly to prevent 500 errors.

## 3. Database & Optimization Conventions (SQLite)
*   **Date Filtering:** Use `STRFTIME('%m', date_column) = ? AND STRFTIME('%Y', date_column) = ?` with zero-padded strings to avoid JS `Date` object timezone issues.
*   **N+1 Insert/Updates:** 
    *   Use `RETURNING *` with `insertStmt.get(...)` inside a `db.transaction()` loop to fetch inserted records back immediately.
    *   Alternatively, consolidate updates into a single `db.prepare(...).run(...)` execution using a dynamic `CASE` statement with fixed placeholders.
*   **`IN (...)` Clauses:** Chunk IDs into smaller batches (500-900) to avoid exceeding `SQLITE_MAX_VARIABLE_NUMBER`.
*   **Aggregation:** Complex SQL aggregations (like `GROUP BY` with `SUM(CASE...)`) over large `IN` clauses can be slower than flat fetching + application-side processing. Always benchmark.
*   **Batch Creation:** Use `INSERT INTO ... SELECT ... WHERE NOT EXISTS` to efficiently create missing records in bulk.

## 4. Performance Optimizations
*   **String Matching (V8):** For small sets of string comparisons, sequential `if` or `else if` with strict equality (`===`) is faster than dictionary lookups or `Set.has()`.
*   **Data Aggregation:** Use in-place mutation and single-pass iteration to update pre-aggregated `Map` structures over nested loops, `.filter()`, or `.map()` copying.
*   **Memory Lookups:** Pre-compute a `Map` keyed by foreign keys to map child records to parents in O(1) time. Avoid N+1 database queries by performing bulk data fetches (`IN (...)`) before loops.
*   **Module-Level Caching:** 
    *   Explicitly document deterministic caching rules for `Intl.DateTimeFormat`. The global formatter cache must stringify and hash option configurations utilizing alphabetical key sorting (`Object.keys(options).sort()`). This guarantees absolute instance reusability (60 FPS on mobile), even if different components spread options in a varied property sequence.
    *   Cache `better-sqlite3` prepared statements at the module level.
*   **Parallel Offline Sync (Mobile):** Parallelize offline requests via `Promise.allSettled`. Ensure "poison pill" handling (mark 400 Bad Requests as synced to prevent queue blocking).

## 5. Benchmarking Standards
*   **Location/Execution:** Place standalone scripts in `server/benchmarks/`.
*   **Naming:** `benchmark_[entity]_[optimization_type].ts` (e.g., `benchmark_payroll_bulk_insert.ts`).
*   **Env Isolation:** Use `process.env.DB_PATH` or fallback (never hardcode).
*   **Warming Up:** Run baseline and optimized logic at least 50-100 times before starting timers.
*   **Precision:** Use `performance.now()`.
*   **Output Format:** Must print `Improvement: [Value]%` or `Improvement: [Value]x faster`, and `Correctness Check: PASS` or `Verified: PASS`.
*   **Preservation:** Intentionally unoptimized 'Slow' functions in benchmark scripts exist for contrast and must not be refactored.

## 6. Testing & Environment Setup
*   **Testing Tool:** Jest. 'Frontend' uses `jsdom`; 'Backend' uses `node`.
*   **Integration Tests:** Focus heavily on Supertest integration testing. Unit tests are for pure logic only. Use `db.exec` and `db.prepare.run()` for test setups.
*   **Teardown Isolation:** Explicitly run `DELETE FROM` statements in `afterEach` hooks to reset state (e.g., `payrolls`, `payroll_transactions`).
*   **Mocking DB:** Use `jest.spyOn(db, 'prepare')` bound properly to mock specific 500 DB errors. Reuse existing mock structures within the file.
*   **Auth Requirement:** Integration tests require the `JWT_SECRET` env variable (`JWT_SECRET="test_secret" npm test`).
*   **Environment Hurdles:** The dev environment lacks internet access. `npm install` and `npm ci` fail (ETIMEDOUT). Use `npm rebuild` if necessary. Also, try `npm install --legacy-peer-deps` for dependence issues.
*   **Alternative Execution:** Node.js v22.22.1 can run TS directly via the `--experimental-strip-types` flag for quick scripts.

## 7. Project Structure & Tech Stack
*   **Frontend:** React (Vite), Tailwind CSS, `@tanstack/react-query` for state.
*   **Backend:** Node.js, Express, `better-sqlite3`.
*   **Mobile:** React Native (Expo) inside the `/mobile` directory, uses `expo-sqlite`, `mobile/tsconfig.json` extends `expo/tsconfig.base`. Web root uses general `package.json` with npm.
*   **Mobile Accessibility:** Use `accessibilityLabel` and `accessibilityRole` instead of web ARIA attributes.