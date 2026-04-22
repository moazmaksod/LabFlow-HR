import express from 'express';
import authRoutes from './routes/authRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userRoutes from './routes/userRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import auditRoutes from './routes/auditRoutes.js';

// Configuration Fail-Fast Validation
const tz = process.env.APP_TIMEZONE;
if (!tz) {
    console.error('FATAL ERROR: APP_TIMEZONE environment variable is missing.');
    process.exit(1);
}
try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
} catch (e) {
    console.error(`FATAL ERROR: Invalid APP_TIMEZONE '${tz}'. Must be a valid IANA timezone.`);
    process.exit(1);
}

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('public/uploads'));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LabFlow API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);

import db from './db/index.js';

import { evaluateUserAttendance } from './services/attendanceEvaluationService.js';

// Global Missed Shift Cleanup Interval (30 minutes) -> Replaced with real-time 1-minute Active Attendance Evaluator
const evaluationInterval = setInterval(() => {
    try {
        // Find all users who are currently checked in (active attendance)
        const activeUsers = db.prepare(`
            SELECT DISTINCT user_id
            FROM attendance
            WHERE check_out IS NULL
        `).all() as any[];

        for (const user of activeUsers) {
            evaluateUserAttendance(user.user_id, process.env.APP_TIMEZONE!);
        }
    } catch (error) {
        console.error("Error evaluating real-time attendance:", error);
    }
}, 60 * 1000); // Every 1 minute
evaluationInterval.unref();

export default app;
