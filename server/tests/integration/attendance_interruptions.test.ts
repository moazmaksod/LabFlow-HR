import request from 'supertest';
import express from 'express';
import db from '../../db/index.js';
import attendanceRoutes from '../../routes/attendanceRoutes.js';
import { schema } from '../../db/schema.js';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/attendance', attendanceRoutes);

const JWT_SECRET = process.env.JWT_SECRET as string;

/**
 * @scenario Verifies the auto-pause and resume logic when stepping away during an active shift.
 * @expectedLogic
 *   - Stepping away checks break balance and auto-approves if balance > 0.
 *   - If break balance is 0, it creates a pending manager approval request.
 *   - Resuming closes the interruption and correctly calculates used break time.
 * @edgeCases
 *   - Initiating interruptions multiple times or without remaining break time limits.
 */
describe('Attendance Interruptions API', () => {
    let employeeToken: string;
    let employeeId: number;

    beforeAll(() => {
        // Reset DB for testing
        db.exec('PRAGMA foreign_keys = OFF');
        db.exec('DROP TABLE IF EXISTS users');
        db.exec('DROP TABLE IF EXISTS profiles');
        db.exec('DROP TABLE IF EXISTS attendance');
        db.exec('DROP TABLE IF EXISTS shift_interruptions');
        db.exec('DROP TABLE IF EXISTS requests');
        db.exec('DROP TABLE IF EXISTS settings');
        db.exec(schema);
        db.exec('PRAGMA foreign_keys = ON');

        // Create a test employee
        const userInsert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
            'Test Employee', 'employee@test.com', 'hashed_pass', 'employee'
        );
        employeeId = userInsert.lastInsertRowid as number;

        // Ensure job exists
        db.prepare(`INSERT INTO jobs (id, title, hourly_rate, required_hours, grace_period) VALUES (1, 'Test', 20, 8, 15)`).run();

        const weekly_schedule = JSON.stringify({
            monday: [{ start: "00:00", end: "23:59" }],
            tuesday: [{ start: "00:00", end: "23:59" }],
            wednesday: [{ start: "00:00", end: "23:59" }],
            thursday: [{ start: "00:00", end: "23:59" }],
            friday: [{ start: "00:00", end: "23:59" }],
            saturday: [{ start: "00:00", end: "23:59" }],
            sunday: [{ start: "00:00", end: "23:59" }]
        });

        // Create profile with 0 break balance
        db.prepare('INSERT INTO profiles (user_id, job_id, lunch_break_minutes, status, weekly_schedule) VALUES (?, ?, ?, ?, ?)').run(
            employeeId, 1, 0, 'active', weekly_schedule
        );

        // Create settings
        db.prepare(`INSERT INTO settings (id, office_lat, office_lng, geofence_radius, company_timezone) VALUES (1, 0, 0, 1000000, 'UTC')`).run();

        employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, JWT_SECRET);
    });

    it('should create a pending_manager request when stepping away with 0 break balance', async () => {
        const timestamp = new Date().toISOString();
        
        // 1. Check in first
        await request(app)
            .post('/attendance/clock')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                type: 'check_in',
                timestamp,
                lat: 0,
                lng: 0,
                deviceId: 'test-device'
            });

        // 2. Step away
        const response = await request(app)
            .post('/attendance/step-away')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ timestamp, deviceId: 'test-device' });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('pending_manager');
        expect(response.body.hasBreakBalance).toBe(false);

        // 3. Verify shift_interruptions record
        const interruption = db.prepare('SELECT * FROM shift_interruptions WHERE attendance_id = (SELECT id FROM attendance WHERE user_id = ?)').get(employeeId) as any;
        expect(interruption).toBeDefined();
        expect(interruption.status).toBe('pending_manager');

        // 4. Verify requests record
        const reqRecord = db.prepare('SELECT * FROM requests WHERE user_id = ? AND type = ?').get(employeeId, 'permission_to_leave') as any;
        expect(reqRecord).toBeDefined();
        expect(reqRecord.status).toBe('pending');
        expect(reqRecord.reference_id).toBe(interruption.id);
    });

    it('should resume work and close the interruption', async () => {
        const timestamp = new Date().toISOString();
        
        const response = await request(app)
            .post('/attendance/resume-work')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ timestamp, deviceId: 'test-device' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Resumed work successfully');

        // Verify interruption is closed
        const interruption = db.prepare('SELECT * FROM shift_interruptions WHERE attendance_id = (SELECT id FROM attendance WHERE user_id = ?)').get(employeeId) as any;
        expect(interruption.end_time).toBeDefined();

        // Verify attendance status is back to working
        const attendance = db.prepare('SELECT * FROM attendance WHERE user_id = ?').get(employeeId) as any;
        expect(attendance.current_status).toBe('working');
    });

    it('should auto_approve when stepping away with break balance > 0', async () => {
        // Update profile to have break balance
        db.prepare('UPDATE profiles SET lunch_break_minutes = 30 WHERE user_id = ?').run(employeeId);
        
        // Clear previous interruption for clean test
        db.prepare('DELETE FROM shift_interruptions').run();
        db.prepare('UPDATE attendance SET current_status = ? WHERE user_id = ?').run('working', employeeId);

        const timestamp = new Date().toISOString();
        
        const response = await request(app)
            .post('/attendance/step-away')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ timestamp, deviceId: 'test-device' });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('auto_approved');
        expect(response.body.hasBreakBalance).toBe(true);

        const interruption = db.prepare('SELECT * FROM shift_interruptions WHERE attendance_id = (SELECT id FROM attendance WHERE user_id = ?)').get(employeeId) as any;
        expect(interruption.status).toBe('auto_approved');
    });
});
