# Attendance Status Dictionary

This document serves as the single source of truth for all attendance statuses used across the HR and Attendance Tracking System. These statuses are strictly enforced at the database level and are used by the backend logic and frontend UI.

| Status      | Description                                                                                       | UI Color | Trigger Condition                                                                          |
| :---------- | :------------------------------------------------------------------------------------------------ | :------- | :----------------------------------------------------------------------------------------- |
| `on_time`   | Employee clocked in within the acceptable grace period and completed their shift.                 | Green    | Check-in ≤ (Schedule Start + Grace Period) AND Check-out ≥ Schedule End                    |
| `late_in`   | Employee clocked in after the acceptable grace period.                                            | Yellow   | Check-in > (Schedule Start + Grace Period)                                                 |
| `early_out` | Employee clocked out before the scheduled end time (minus grace period).                          | Orange   | Check-out < (Schedule End - Grace Period)                                                  |
| `half_day`  | Employee worked significantly less than their scheduled hours (e.g., less than 50% of the shift). | Purple   | Total worked hours < (Scheduled Hours / 2)                                                 |
| `absent`    | Employee did not clock in for their scheduled shift.                                              | Red      | No check-in record exists for a scheduled workday (typically flagged by a daily cron job). |

## Enforcement

- **Database:** The `attendance` table enforces these values using a `CHECK (status IN ('on_time', 'late_in', 'early_out', 'absent', 'half_day'))` constraint.
- **Backend:** The `attendanceController.ts` evaluates the check-in and check-out times against the employee's schedule and the system's grace period to automatically assign the correct status.
- **Frontend:** Both the React Web Dashboard and the React Native Mobile App use a standardized color-coding scheme (detailed above) to display these statuses consistently.

## Legacy Statuses

During the migration to this standardized dictionary, the following legacy statuses were mapped to their new equivalents:

- `present` -> `on_time`
- `late` -> `late_in`
- `half-day` -> `half_day`

These legacy statuses are no longer valid and will be rejected by the database.
