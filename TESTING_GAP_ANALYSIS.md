# TESTING GAP ANALYSIS

## Overview
This document outlines the missing test cases and coverage gaps identified across the LabFlow HR platform during the structural reorganization and review of the testing suite. These gaps primarily relate to new feature additions and recent architectural changes that need dedicated test scenarios to ensure robustness.

---

## 1. Monotonic Shadow Clock / Time Drift Protection
**Context:** The mobile application now uses a Monotonic Shadow Clock (`performance.now()`) to accurately track time without relying on potentially delayed OS intervals or user-manipulated device clocks.
**Missing Tests:**
- **Drift Detection Threshold:** Test that an error/warning is triggered when the delta between the expected interval time and the monotonic shadow clock exceeds the defined threshold (e.g., system slept, heavy lag).
- **Backward Time Jump Block:** Ensure the UI instantly hard-blocks the user (disabling actions) if the shadow clock detects the OS time jumped backwards (e.g., user changed settings to cheat the clock).
- **Background Resumption Sync:** Verify that when the app resumes from a background state (where interval ticks paused), the shadow clock instantly catches up using the exact elapsed `performance.now()` delta.

---

## 2. Attendance Bonus Logic (100% Attendance Check)
**Context:** Payroll generation was updated to include a fixed Attendance Bonus if an employee's delay and absence minutes equal 0 for the pay period.
**Missing Tests:**
- **Perfect Attendance Payout:** Test a payroll generation for an employee with exactly 0 minutes delayed and 0 minutes absent, ensuring the exact bonus amount is appended to their total wage.
- **Bonus Forfeiture on Delay:** Test that an employee with >0 delay minutes (e.g., 5 minutes late one day) correctly forfeits the Attendance Bonus entirely.
- **Bonus Forfeiture on Absence:** Test that a single day of unapproved absence entirely voids the Attendance Bonus for that pay period.

---

## 3. Geofence Toggle and Radius Enforcement
**Context:** The `radius_meters` setting was updated/clarified as `geofence_radius`.
**Missing Tests:**
- **Geofence Enforcement (Outside Radius):** A test simulating a clock-in attempt from coordinates strictly outside the `geofence_radius` should explicitly test the haversine formula rejection.
- **Geofence Enforcement (Edge Radius):** A test simulating a clock-in exactly on the edge of the allowed radius.
- **Geofence Bypass Toggle (If applicable):** If managers can toggle geofencing off globally or per-employee, a test must confirm that coordinates are ignored when the toggle is active.

---

## 4. Fail-Fast Environment Variable Checks
**Context:** The application removed hardcoded fallback secrets (e.g., `JWT_SECRET`) for security purposes.
**Missing Tests:**
- **Server Startup Crash:** A bootstrap test ensuring that the server immediately exits/throws a fatal error during startup if critical environment variables (like `JWT_SECRET`, database paths) are missing.
- **Database Initialization Errors:** Ensure that `initDb()` appropriately fails fast and throws descriptive errors if the better-sqlite3 database file cannot be created/opened.

---

## Recommendations
Prioritize implementing the **Attendance Bonus** and **Geofence Radius** backend integration tests first, as they directly impact payroll financials and daily operational constraints. The **Monotonic Shadow Clock** tests should be implemented in the frontend/mobile test suite using Jest fake timers and manipulating `performance.now()`.
