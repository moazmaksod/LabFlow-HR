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

// Auto-Completion Maintenance and Shift Rollover (Auto-Split)
function autoCompleteShifts() {
    try {
        const now = new Date().toISOString();

        db.transaction(() => {
            // SCENARIO A: Scheduled to Overtime
            // Find users clocked into a scheduled shift that has now ended
            const pastShifts = db.prepare(`
                SELECT a.id as attendance_id, a.user_id, a.date, a.location_lat, a.location_lng,
                       s.id as shift_id, s.end_time as shift_end
                FROM attendance a
                JOIN shift_instances s ON a.shift_id = CAST(s.id AS TEXT)
                WHERE a.check_out IS NULL
                  AND s.status = 'Scheduled'
                  AND s.end_time < ?
            `).all(now) as any[];

            for (const record of pastShifts) {
                // Force clock-out the current record at exactly the shift end time
                db.prepare(`
                    UPDATE attendance
                    SET check_out = ?
                    WHERE id = ?
                `).run(record.shift_end, record.attendance_id);

                // Create a NEW overtime attendance record starting at shift_end
                // Generating an unscheduled ID format as used in attendanceController
                const newShiftId = `unscheduled_${record.date.replace(/-/g, '')}_${new Date(record.shift_end).getTime()}`;

                db.prepare(`
                    INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status, current_status, shift_id)
                    VALUES (?, ?, ?, ?, ?, 'unscheduled', 'working', ?)
                `).run(record.user_id, record.shift_end, record.date, record.location_lat, record.location_lng, newShiftId);

                // Mark the old shift instance as Completed
                db.prepare(`UPDATE shift_instances SET status = 'Completed' WHERE id = ?`).run(record.shift_id);
            }

            // SCENARIO B: Overtime to Next Shift
            // Find users clocked in unscheduled (overtime) while their NEXT scheduled shift has started
            const overtimeRecords = db.prepare(`
                SELECT a.id as attendance_id, a.user_id, a.location_lat, a.location_lng,
                       s.id as next_shift_id, s.start_time as next_shift_start, s.logical_date
                FROM attendance a
                JOIN shift_instances s ON a.user_id = s.user_id
                WHERE a.check_out IS NULL
                  AND a.status = 'unscheduled'
                  AND s.status = 'Scheduled'
                  AND s.start_time <= ?
                  AND s.end_time > ?
                  AND a.check_in <= s.start_time
                ORDER BY s.start_time ASC
            `).all(now, now) as any[];

            for (const record of overtimeRecords) {
                // Force clock-out the overtime record at the start of the next shift
                db.prepare(`
                    UPDATE attendance
                    SET check_out = ?
                    WHERE id = ?
                `).run(record.next_shift_start, record.attendance_id);

                // Create a NEW scheduled attendance record starting at next_shift_start
                db.prepare(`
                    INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status, current_status, shift_id)
                    VALUES (?, ?, ?, ?, ?, 'on_time', 'working', ?)
                `).run(record.user_id, record.next_shift_start, record.logical_date, record.location_lat, record.location_lng, record.next_shift_id.toString());
            }

            // Finally, clean up any remaining scheduled shifts that have passed without being clocked into
            const result = db.prepare(`
                UPDATE shift_instances
                SET status = 'Completed'
                WHERE status = 'Scheduled' AND end_time < ?
            `).run(now);

            if (result.changes > 0 || pastShifts.length > 0 || overtimeRecords.length > 0) {
                console.log(`Auto-completion done: ${result.changes} orphaned shifts completed. ${pastShifts.length} auto-splits to overtime. ${overtimeRecords.length} auto-splits to new shift.`);
            }
        })();

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
