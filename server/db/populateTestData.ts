import bcrypt from 'bcryptjs';
import db, { initDb } from './index.js';
import { generateDailyAttendance } from '../services/dailyAttendanceService.js';
import logger from '../utils/logger.js';

async function populate() {
  logger.info('Starting test data population...');
  initDb();
  
  // Clear existing test data
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM users;
    DELETE FROM profiles;
    DELETE FROM jobs;
    DELETE FROM attendance;
    DELETE FROM requests;
    DELETE FROM shift_interruptions;
    DELETE FROM shift_instances;
    DELETE FROM daily_attendance;
    DELETE FROM payrolls;
    DELETE FROM audit_logs;
    DELETE FROM notifications;
    PRAGMA foreign_keys = ON;
  `);
  logger.info('Cleared old database records.');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password123', salt);

  // 1. Insert Jobs
  const insertJob = db.prepare(`
    INSERT INTO jobs (title, hourly_rate, required_hours, required_hours_per_week, default_annual_leave_days, default_sick_leave_days, allow_overtime, employment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const devJobId = insertJob.run('Software Engineer', 35.00, 8.0, 40, 21, 7, 1, 'full-time').lastInsertRowid;
  const qaJobId = insertJob.run('QA Tester', 25.00, 8.0, 40, 21, 7, 1, 'full-time').lastInsertRowid;
  const pmJobId = insertJob.run('Product Manager', 45.00, 8.0, 40, 21, 7, 0, 'full-time').lastInsertRowid;
  logger.info('Created test jobs.');

  // 2. Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);
  const janeId = insertUser.run('Jane Manager', 'jane@example.com', passwordHash, 'manager').lastInsertRowid;
  const johnId = insertUser.run('John Employee', 'john@example.com', passwordHash, 'employee').lastInsertRowid;
  const aliceId = insertUser.run('Alice Tester', 'alice@example.com', passwordHash, 'employee').lastInsertRowid;
  const bobId = insertUser.run('Bob Product', 'bob@example.com', passwordHash, 'employee').lastInsertRowid;
  const charlieId = insertUser.run('Charlie Pending', 'charlie@example.com', passwordHash, 'pending').lastInsertRowid;
  logger.info('Created test users.');

  // 3. Insert Profiles
  const insertProfile = db.prepare(`
    INSERT INTO profiles (user_id, job_id, status, hourly_rate, weekly_schedule, hire_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const devSchedule = JSON.stringify({
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }]
  });

  insertProfile.run(janeId, null, 'active', 0, null, '2025-01-01');
  insertProfile.run(johnId, devJobId, 'active', 35.00, devSchedule, '2025-06-01');
  insertProfile.run(aliceId, qaJobId, 'active', 25.00, devSchedule, '2025-07-15');
  insertProfile.run(bobId, pmJobId, 'active', 45.00, devSchedule, '2025-08-20');
  insertProfile.run(charlieId, null, 'inactive', 0, null, null);
  logger.info('Created test profiles.');

  // 4. Generate shifts and attendance logs for the last 14 days
  const today = new Date();
  const insertShift = db.prepare(`
    INSERT INTO shift_instances (user_id, start_time, end_time, logical_date, status)
    VALUES (?, ?, ?, ?, 'Scheduled')
  `);

  const insertAttendance = db.prepare(`
    INSERT INTO attendance (user_id, check_in, check_out, date, checkin_status, checkout_status, working_status)
    VALUES (?, ?, ?, ?, ?, ?, 'working')
  `);

  const daysToSeed = 14;
  logger.info(`Seeding schedule shifts and attendance logs for the last ${daysToSeed} days...`);

  for (let i = daysToSeed; i >= 1; i--) {
    const seedDate = new Date(today);
    seedDate.setDate(today.getDate() - i);
    const dateStr = seedDate.toISOString().split('T')[0];
    const dayOfWeek = seedDate.getDay();

    // Skip weekends (0 is Sunday, 6 is Saturday) for standard schedule shifts
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // 4a. John Employee shifts & attendance
      const johnShiftStart = `${dateStr}T09:00:00.000Z`;
      const johnShiftEnd = `${dateStr}T17:00:00.000Z`;
      const johnShiftId = insertShift.run(johnId, johnShiftStart, johnShiftEnd, dateStr).lastInsertRowid;

      if (i % 3 === 0) {
        // Late arrival: 09:35 to 17:00
        const logId = insertAttendance.run(johnId, `${dateStr}T09:35:00.000Z`, `${dateStr}T17:00:00.000Z`, dateStr, 'late_in', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(johnShiftId, logId);

        // Seed a pending attendance correction request for the 3rd day ago
        if (i === 3) {
          db.prepare(`
            INSERT INTO requests (user_id, attendance_id, reason, type, requested_check_in, requested_check_out, value, status, created_at)
            VALUES (?, ?, ?, 'attendance_correction', ?, ?, ?, 'pending', ?)
          `).run(
            johnId,
            logId,
            'Forgot to clock in on time',
            `${dateStr}T09:00:00.000Z`, // Proposed check-in
            `${dateStr}T17:00:00.000Z`, // Proposed check-out
            35, // Value (35 missing minutes)
            today.toISOString()
          );
        }
      } else if (i % 3 === 1) {
        // On time check-in, late clock-out: 09:00 to 18:30 (overtime)
        const logId = insertAttendance.run(johnId, `${dateStr}T09:00:00.000Z`, `${dateStr}T18:30:00.000Z`, dateStr, 'on_time', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(johnShiftId, logId);
        
        // Create an overtime approval request
        db.prepare(`
          INSERT INTO requests (user_id, attendance_id, reason, type, value, paid_minutes, status)
          VALUES (?, ?, ?, 'overtime_approval', 90, 90, 'approved')
        `).run(johnId, logId, 'Completed release deployment');
      } else {
        // Normal day: 09:00 to 17:00
        const logId = insertAttendance.run(johnId, `${dateStr}T09:00:00.000Z`, `${johnShiftEnd}`, dateStr, 'on_time', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(johnShiftId, logId);
      }

      // 4b. Alice Tester shifts & attendance
      const aliceShiftStart = `${dateStr}T09:00:00.000Z`;
      const aliceShiftEnd = `${dateStr}T17:00:00.000Z`;
      const aliceShiftId = insertShift.run(aliceId, aliceShiftStart, aliceShiftEnd, dateStr).lastInsertRowid;

      if (i === 2) {
        // Absent (no attendance log created)
      } else if (i === 5) {
        // On time check-in, early out (15:00 instead of 17:00)
        const logId = insertAttendance.run(aliceId, `${dateStr}T09:00:00.000Z`, `${dateStr}T15:00:00.000Z`, dateStr, 'on_time', 'early_out').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(aliceShiftId, logId);

        // Request early leave permission (approved)
        db.prepare(`
          INSERT INTO requests (user_id, attendance_id, reason, type, value, paid_minutes, status)
          VALUES (?, ?, ?, 'early_leave_approval', 120, 120, 'approved')
        `).run(aliceId, logId, 'Doctor appointment');
      } else {
        // Normal day
        const logId = insertAttendance.run(aliceId, `${dateStr}T09:00:00.000Z`, `${dateStr}T17:00:00.000Z`, dateStr, 'on_time', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(aliceShiftId, logId);
      }

      // 4c. Bob Product shifts & attendance
      const bobShiftStart = `${dateStr}T09:00:00.000Z`;
      const bobShiftEnd = `${dateStr}T17:00:00.000Z`;
      const bobShiftId = insertShift.run(bobId, bobShiftStart, bobShiftEnd, dateStr).lastInsertRowid;

      if (i === 4) {
        // Checked in, but has a step-away (shift interruption) from 11:00 to 12:30
        const logId = insertAttendance.run(bobId, `${dateStr}T09:00:00.000Z`, `${dateStr}T17:00:00.000Z`, dateStr, 'on_time', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(bobShiftId, logId);

        // Shift interruption
        const interId = db.prepare(`
          INSERT INTO shift_interruptions (attendance_id, start_time, end_time, type, status)
          VALUES (?, ?, ?, 'step_away', 'manager_approved')
        `).run(logId, `${dateStr}T11:00:00.000Z`, `${dateStr}T12:30:00.000Z`).lastInsertRowid;

        // Permission to leave request (unpaid)
        db.prepare(`
          INSERT INTO requests (user_id, attendance_id, shift_interruption_id, reason, type, value, paid_minutes, status)
          VALUES (?, ?, ?, ?, 'permission_to_leave', 90, 0, 'approved')
        `).run(bobId, logId, interId, 'Personal errand');
      } else {
        // Normal day
        const logId = insertAttendance.run(bobId, `${dateStr}T09:00:00.000Z`, `${dateStr}T17:00:00.000Z`, dateStr, 'on_time', 'on_time').lastInsertRowid;
        db.prepare('UPDATE attendance SET shift_id = ? WHERE id = ?').run(bobShiftId, logId);
      }
    }

    // 5. Generate daily attendance metrics for the seeded date
    generateDailyAttendance(dateStr);
  }

  // 6. Seed some pending requests to display in the dashboards

  db.prepare(`
    INSERT INTO requests (user_id, reason, type, value, status, created_at)
    VALUES (?, ?, 'early_leave_approval', 60, 'pending', ?)
  `).run(aliceId, 'Need to pick up kids', today.toISOString());

  logger.info('Successfully populated database with test data!');
  process.exit(0);
}

populate().catch(err => {
  logger.error('Failed to populate test data:', err);
  process.exit(1);
});
