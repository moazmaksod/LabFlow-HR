# System Architecture Investigation: Business Logic Timezone Decoupling

## 1. Investigation Report

### Locations of `APP_TIMEZONE` and Local Time Evaluation

After conducting a comprehensive search across the server codebase, here are the locations where `process.env.APP_TIMEZONE` and native `new Date()` timezone-dependent logic are currently leaking into the backend business logic:

1. **`server/utils/timeManager.ts`**:
   - `getAppNow()` explicitly checks for `process.env.APP_TIMEZONE` but simply returns `new Date().toISOString()`.
   - `parseAndFormat` and `getDateStringInTimezone` fallback to `process.env.APP_TIMEZONE` and heavily utilize `Intl.DateTimeFormat` to shift time into local representations.

2. **`server/controllers/attendanceController.ts`**:
   - Fetches `APP_TIMEZONE` and passes it to `processAttendanceEvent`.
   - **Leak**: Calculates `logicalDate` for unscheduled check-ins using `getDateStringInTimezone(timestamp, timezone)`.
   - **Leak**: Retrieves "Today's" statistics using `getDateStringInTimezone(getAppNow(), timezone)`.

3. **`server/controllers/userController.ts`**:
   - In `getProfile()`, determines "Today's shifts" by evaluating `getDateStringInTimezone(currentServerTime, timezone)` if there is no currently active shift.

4. **Service Layer Signatures**:
   - Both `evaluateUserAttendance` and `generateShiftInstances` accept a `timezone` argument (passed as `process.env.APP_TIMEZONE!`), but interestingly, the internal logic within these services *already* operates primarily on UTC and ignores the injected parameter.

5. **App Initialization & Settings (`app.ts`, `settingsController.ts`)**:
   - Validates the presence of `APP_TIMEZONE` on boot.
   - Bootstraps `company_timezone` during settings initialization.

### Scheduled vs. Unscheduled Decision Logic

**How it decides:**
When a user clocks in, `processAttendanceEvent` queries the `shift_instances` table to find an active shift:
```sql
SELECT * FROM shift_instances
WHERE user_id = ?
  AND ? BETWEEN datetime(start_time, '-' || ? || ' minutes') AND end_time
```
Here, the incoming pure UTC timestamp is compared directly against the UTC `start_time` and `end_time` stored in the database. 

**Does it incorrectly shift timestamps?**
For the **Scheduled check-in lookup**, no. The comparison relies entirely on UTC streams.
However, **if no shift is found (Unscheduled Check-in)**, the server **does** incorrectly shift the timestamp! It calculates the `logicalDate` for the unscheduled shift by passing the UTC timestamp through `getDateStringInTimezone(timestamp, APP_TIMEZONE)`. This means an unscheduled check-in at 23:00 UTC might be recorded as "tomorrow" or "yesterday" depending purely on the physical location defined in the `.env` file, breaking the single source of truth.

### "Current Day" and "Shift Start/End" Boundary Calculations

1. **Shift Boundaries (`shiftInstanceService.ts`)**:
   - Currently, `generateShiftInstances` loops through 30 days and generates UTC timestamps using `Date.UTC(year, month, day, hours, minutes)`. This correctly creates fixed UTC bounds in the database, irrespective of the server's local time.
2. **Current Day Evaluation**:
   - "Current Day" logic leaks primarily via `getDateStringInTimezone` in the controllers. Whenever the server needs to group data by "date" (e.g., in `getProfile` to fetch "today_shifts", or in `getAttendanceStats` to calculate today's metrics), it calculates the date string based on `APP_TIMEZONE`, creating a disjointed reality where "Today" changes depending on the `.env` rather than the absolute UTC timeline.

---

## 2. Proposed Refactor Plan

To make the backend business logic 100% "Timezone Blind", we will implement the following strategy:

### Phase 1: Clean Up `timeManager.ts` & Validation
- **Action:** Remove the `APP_TIMEZONE` environment variable checks in `getAppNow()`.
- **Action:** Stop passing `timezone` arguments down to business-logic functions like `evaluateUserAttendance` and `generateShiftInstances`.
- **Action:** Ensure `getAppNow()` acts purely as a strict UTC `toISOString()` provider.

### Phase 2: Refactor `logical_date` Resolution
- **Action:** Replace all usages of `getDateStringInTimezone(timestamp, timezone)` for logical date calculations with strict UTC slicing: `timestamp.split('T')[0]`.
- **Impacts:**
  - `attendanceController.ts` -> Unscheduled shifts will base their `logical_date` strictly on UTC `YYYY-MM-DD`.
  - `attendanceController.ts` -> Today's statistics will be fetched by comparing against the UTC date.
  - `userController.ts` -> `getProfile` will fetch today's shifts matching the pure UTC date.

### Phase 3: Service Layer Streamlining
- **Action:** Remove the `timezone` argument from `evaluateUserAttendance` in `attendanceEvaluationService.ts`. The service already uses `getAppNow()` (UTC), so removing the unused argument enforces the "blind" design.
- **Action:** Remove the `timezone` argument from `generateShiftInstances` in `shiftInstanceService.ts`. Validate that the `Date.UTC` calculation continues to reliably map the weekly JSON payload into strict UTC `shift_instances` rows.

### Phase 4: `APP_TIMEZONE` Eradication
- **Action:** Remove references to `APP_TIMEZONE` in `app.ts` initialization.
- **Action:** Remove it from setting bootstrapping logic (or map it to a DB-driven fallback if absolutely necessary for a purely frontend display setting).

### Outcome
By implementing this plan, the backend will treat the progression of time strictly as a UTC integer/string stream. All schedules, clock-ins, overtimes, and daily groupings will evaluate identically regardless of where the server is hosted, achieving true "Timezone Blindness" at the business logic layer.
