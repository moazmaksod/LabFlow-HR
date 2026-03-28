# Frontend Alignment & Execution Plan

### 1. Obsolete Code to Delete (Frontend "Dumbness")
*   **Target:** `mobile/src/screens/DashboardScreen.tsx`
*   **Action:** Completely remove the frontend schedule parsing and validation logic inside the `handleClock` function (Lines 132-191). The mobile app should **not** calculate grace periods, find closest shifts, or determine if a punch is "Late", "Early", or "Overtime".
*   **Replacement:** `handleClock` will be simplified to a basic confirmation dialog ("Are you sure you want to clock in/out?"). The backend's `attendanceController` already handles all the complex schedule-driven logic, request generation, and status assignment.

### 2. Mobile App Updates (The Employee Experience)
*   **Target:** `mobile/src/screens/DashboardScreen.tsx` (State Machine)
    *   **Action:** Ensure the UI strictly follows the backend state. The buttons (Clock In, Clock Out, Step Away, Resume Work) will remain conditionally rendered based on `currentStatus` ('working', 'away', 'none').
*   **Target:** `mobile/src/screens/HistoryScreen.tsx` (Transparent History)
    *   **Action:** Enhance the UI to clearly display the new backend statuses (`unscheduled`, `early_out`, `on_time`, `late_in`, etc.) using distinct colors and icons.
    *   **Action:** Improve the visibility of "Step Away" gaps (shift interruptions) so they are visible on the main history card, not just hidden inside the details modal.
*   **Target:** `mobile/src/screens/PayslipScreen.tsx` (NEW FILE - The Honest Payslip)
    *   **Action:** Create a new screen for employees to view their payroll history.
    *   **Action:** Create a new backend endpoint (e.g., `GET /payroll/my-records`) if necessary, or use existing ones filtered by the user's ID.
    *   **Action:** Design the UI to show the aggregated payslip (Base Salary, Additions, Deductions, Net).
    *   **Action:** **Crucially**, include a section to show all atomic transactions, explicitly highlighting **Rejected** transactions (e.g., denied overtime) and prominently displaying the `manager_notes` explaining the rejection.
    *   **Action:** Add this new screen to the mobile navigation stack (`mobile/App.tsx` or similar).

### 3. Web Dashboard Updates (The Manager Experience)
*   **Target:** `src/features/requests/RequestManagement.tsx` (The Requests Inbox)
    *   **Action:** The logic for mandatory `managerNote` is present, but the UI needs refinement. I will update the modal to make the "Manager Notes/Justification" text area highly prominent, clearly marked as **Required for Payroll Audit**, and visually block the Approve/Reject buttons until it is filled.
*   **Target:** `src/features/employees/EmployeeDetail.tsx` & `src/features/jobs/JobManagement.tsx` (Schedule Builder)
    *   **Action:** Review the Schedule Builder UI. The current implementation uses a JSON structure (`{"monday": [{"start": "09:00", "end": "17:00"}]}`). I will ensure the UI controls ("Add Shift", "Remove Shift", "Day Off" checkbox) are visually intuitive and foolproof, ensuring clean data is sent to the backend.

### 4. New Missing Modules (Payroll, Audit)
*   **Target:** `src/features/payroll/PayrollView.tsx` (The Payroll Ledger View)
    *   **Action:** Review the recently created Payroll Ledger View. Ensure it clearly shows "Draft" vs "Finalized" vs "Paid" statuses, aggregates line items, and allows drill-down into atomic transactions via the modal. (This was largely implemented in the previous step, but I will verify it perfectly aligns with the ERP philosophy).
*   **Target:** `src/features/audit/AuditLogs.tsx` (The Audit Trail Viewer)
    *   **Action:** Review the recently created Audit Trail Viewer. Ensure the "Before" and "After" JSON snapshots are easily readable (perhaps adding a diff-viewer style if possible, or just clean formatting) and filterable by entity and action. (Also largely implemented, will verify).
