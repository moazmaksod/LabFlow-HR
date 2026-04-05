import express from 'express';
import authRoutes from './routes/authRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userRoutes from './routes/userRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import auditRoutes from './routes/auditRoutes.js';

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

// Auto-Completion Maintenance for Shift Instances
function autoCompleteShifts() {
    try {
        const now = new Date().toISOString();
        const result = db.prepare(`
            UPDATE shift_instances
            SET status = 'Completed'
            WHERE status = 'Scheduled' AND end_time < ?
        `).run(now);

        if (result.changes > 0) {
            console.log(`Auto-completed ${result.changes} shift instances.`);
        }
    } catch (e) {
        console.error('Error auto-completing shifts:', e);
    }
}

// Run the auto-complete job every 30 minutes
if (process.env.NODE_ENV !== 'test') {
    setInterval(autoCompleteShifts, 30 * 60 * 1000);
    // Run once on startup
    autoCompleteShifts();
}

export default app;
