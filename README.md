# LabFlow HR - HR & Attendance Tracking System

A highly secure, offline-capable, and scalable HR and Attendance Tracking System built with React Native (Mobile), React.js (Web), Node.js (RESTful API), and SQLite.

## 🌟 Key Features

### 🔐 Security & Authentication
- **Role-Based Access Control (RBAC):** Distinct roles for `Manager`, `Employee`, and `Pending` users.
- **Biometric Authentication:** Native biometric login support for the mobile app.
- **Secure Storage:** JWT tokens and sensitive data are handled securely.

### 📍 Attendance & Geofencing
- **Geofenced Clock-in/out:** Employees can only clock in/out if they are within a manager-defined radius of the office coordinates (calculated using the Haversine formula).
- **Offline-First Mobile App:** Attendance logs are stored locally when offline and automatically synced to the backend when the network is restored.

### 👥 HR Management
- **Job Roles & Shifts:** Define job titles, hourly rates, required hours, shift timings, and grace periods.
- **Leave & Excuse Requests:** Employees can submit time-off or excuse requests; managers can approve or reject them.
- **Payroll Calculation:** Automated payroll generation based on logged hours and job hourly rates.
- **Company Settings:** Managers can dynamically update the office location (Latitude/Longitude) and allowed geofence radius.

### 🎨 UI/UX & Localization
- **Dynamic RTL/LTR:** Full support for English (LTR) and Arabic (RTL) using `i18next`.
- **Dark/Light Mode:** Centralized theme provider for seamless switching.
- **Skeleton Loaders:** Smooth data fetching experiences without blocking spinners.

## 📊 Attendance Status Dictionary

The system enforces a strict set of attendance statuses to ensure data integrity and consistent reporting.

| Status        | Description                                                                                       | UI Color | Trigger Condition                                                                          |
| :------------ | :------------------------------------------------------------------------------------------------ | :------- | :----------------------------------------------------------------------------------------- |
| `on_time`     | Employee clocked in within the acceptable grace period and completed their shift.                 | Green    | Check-in ≤ (Schedule Start + Grace Period) AND Check-out ≥ Schedule End                    |
| `late_in`     | Employee clocked in after the acceptable grace period.                                            | Yellow   | Check-in > (Schedule Start + Grace Period)                                                 |
| `early_out`   | Employee clocked out before the scheduled end time (minus grace period).                          | Orange   | Check-out < (Schedule End - Grace Period)                                                  |
| `half_day`    | Employee worked significantly less than their scheduled hours (e.g., less than 50% of the shift). | Purple   | Total worked hours < (Scheduled Hours / 2)                                                 |
| `absent`      | Employee did not clock in for their scheduled shift.                                              | Red      | No check-in record exists for a scheduled workday (typically flagged by a daily cron job). |
| `unscheduled` | Employee clocked in on a day or time not defined in their weekly schedule.                        | Blue     | No matching shift found in the employee's weekly schedule for the clock-in time.           |

## 🛠️ Tech Stack

- **Web Dashboard:** React 19, Vite, Tailwind CSS, Zustand (State), TanStack Query (Server State), Lucide React (Icons).
- **Mobile App:** Expo SDK 55, React Native 0.83, React Navigation v7.
- **Backend API:** Node.js, Express.js, JWT, bcryptjs.
- **Database:** SQLite (`better-sqlite3` with WAL mode enabled for high concurrency).
- **Testing:** Jest, Supertest (In-memory SQLite database for isolated testing).

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Web Dashboard & Backend Setup
The root directory contains the Express backend and the React Vite web dashboard.

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start the development server (Backend on port 3000 + Vite middleware)
npm run dev
```

### 2. Mobile App Setup
The mobile app is located in the `/mobile` directory and uses the latest Expo SDK 55.

```bash
cd mobile

# Install dependencies (CRITICAL: Use --legacy-peer-deps due to React 19 / RN 0.83 strict peer requirements)
npm install --legacy-peer-deps

# Start the Expo development server
npx expo start -c
```

### 3. Running Tests
The backend is fully tested using Jest and Supertest. Tests run against an isolated in-memory SQLite database.

```bash
# Run the entire backend test suite
npm test
```

## 📂 Project Structure

```text
/
├── mobile/                  # Expo React Native App
│   ├── App.tsx              # Mobile Entry Point
│   └── package.json         # Mobile Dependencies (Expo 55, React 19)
├── server/                  # Node.js Express Backend
│   ├── controllers/         # API Logic (Auth, Attendance, Payroll, etc.)
│   ├── db/                  # SQLite Schema and Connection
│   ├── middlewares/         # JWT Auth and RBAC Middleware
│   ├── routes/              # Express API Routes
│   └── tests/               # Jest Unit & Integration Tests
├── src/                     # React Web Dashboard
│   ├── components/          # Reusable UI Components
│   ├── features/            # Feature Modules (Auth, Settings, Jobs, etc.)
│   ├── locales/             # i18n Translation Files (en/ar)
│   ├── store/               # Zustand Global State
│   └── App.tsx              # Web Entry Point
├── package.json             # Root Dependencies & Scripts
└── README.md                # Project Documentation
```

## 🛡️ Testing Coverage
- `auth.test.ts`: Registration, Login, and JWT generation.
- `attendance.test.ts`: Geofencing validation, duplicate clock-in prevention.
- `settings.test.ts`: Manager-only access to update geofence coordinates.
- `jobs.test.ts`: Job creation and fetching.
- `requests.test.ts`: Leave request submission and approval workflows.
- `users.test.ts`: Employee fetching and role updates.
- `payroll.test.ts`: Accurate calculation of hours worked and total pay.
