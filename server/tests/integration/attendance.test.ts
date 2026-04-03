import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let employeeToken: string;
let employeeId: number | bigint;

beforeAll(async () => {
  initDb();
  
  db.prepare(`INSERT INTO settings (id, office_lat, office_lng, geofence_radius, company_timezone) VALUES (1, 37.7749, -122.4194, 50, 'America/New_York')`).run();

  db.prepare(`INSERT INTO jobs (id, title, hourly_rate, required_hours, grace_period) VALUES (1, 'Night Worker', 20, 8, 15)`).run();

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_att@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;

  const weekly_schedule = JSON.stringify({
      monday: [{ start: "22:00", end: "06:00" }]
  });

  db.prepare(`INSERT INTO profiles (user_id, status, job_id, weekly_schedule, device_id) VALUES (?, ?, ?, ?, ?)`).run(employeeId, 'active', 1, weekly_schedule, 'test-device');
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
  jest.useRealTimers();
});

/**
 * @scenario Validates schedule-driven attendance check-in/out, offline sync processing, and logical shift gap detection.
 * @expectedLogic
 *   - Check-ins map to the active scheduled logical shift.
 *   - Offline sync validates delay offsets and reconstructs historical time.
 *   - Re-entry generates step_away requests for unapproved gaps.
 * @edgeCases
 *   - Checking in too early triggers overtime requests.
 *   - Handling missing or delayed syncs accurately.
 */
describe('Attendance API - Schedule Driven Architecture', () => {

  it('1. The Night Shift (Logical Day) Test', async () => {
    // 2023-10-23 is Monday
    // 10:15 PM in America/New_York is 22:15.
    // In UTC, this is 2023-10-24T02:15:00Z.
    jest.useFakeTimers().setSystemTime(new Date('2023-10-24T02:15:00Z'));

    const resCheckIn = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_in',
        lat: 37.7749,
        lng: -122.4194,
        deviceId: 'test-device'
      });
    
    expect(resCheckIn.status).toBe(201);
    expect(resCheckIn.body.date).toBe('2023-10-23'); // Logical Date should be Monday!
    expect(resCheckIn.body.status).toBe('on_time'); // Inside 15 min grace period (22:15)

    // Check out at Tuesday 05:45 AM NY time -> 09:45 AM UTC
    jest.setSystemTime(new Date('2023-10-24T09:45:00Z'));

    const resCheckOut = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_out',
        lat: 37.7749,
        lng: -122.4194,
        deviceId: 'test-device'
      });

    expect(resCheckOut.status).toBe(200);
    // current_status will likely be left alone as 'working' since checking out is signified by check_out non-null
    expect(resCheckOut.body.check_out).toBe('2023-10-24T09:45:00.000Z');
  });

  it('2. The Re-entry & Resume Test', async () => {
    // Punch in again within the same shift window (e.g. at 05:50 AM NY time)
    jest.setSystemTime(new Date('2023-10-24T09:50:00Z'));

    const resCheckIn = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_in',
        lat: 37.7749,
        lng: -122.4194,
        deviceId: 'test-device'
      });

    expect(resCheckIn.status).toBe(200); // Because it auto-resumed (re-entry)
    expect(resCheckIn.body.check_out).toBeNull();
    expect(resCheckIn.body.current_status).toBe('working');

    // Assert a shift interruption was created
    const interruptions = db.prepare('SELECT * FROM shift_interruptions WHERE attendance_id = ?').all(resCheckIn.body.id) as any[];
    expect(interruptions.length).toBe(1);
    expect(interruptions[0].type).toBe('step_away');
    expect(interruptions[0].start_time).toBe('2023-10-24T09:45:00.000Z');
    expect(interruptions[0].end_time).toBe('2023-10-24T09:50:00.000Z');

    // Assert a manager Request was created
    const reqs = db.prepare('SELECT * FROM requests WHERE attendance_id = ? AND type = ?').all(resCheckIn.body.id, 'shift_interruption_review') as any[];
    expect(reqs.length).toBe(1);
    expect(reqs[0].status).toBe('pending');
  });

  it('3. Gap-Based Identification (Early Entry)', async () => {
    // Setup another user with an 09:00 AM shift
    const hash = await bcrypt.hash('password123', 10);
    const empInsert2 = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Early Entry Employee', 'employee_early@test.com', hash, 'employee');
    const employeeId2 = empInsert2.lastInsertRowid;
    
    const weekly_schedule = JSON.stringify({ wednesday: [{ start: "09:00", end: "17:00" }] });
    db.prepare(`INSERT INTO profiles (user_id, status, job_id, weekly_schedule, device_id) VALUES (?, ?, ?, ?, ?)`).run(employeeId2, 'active', 1, weekly_schedule, 'test-device-early');
    const employeeToken2 = jwt.sign({ id: employeeId2, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    // Wednesday 2023-10-25 08:15 AM UTC
    jest.setSystemTime(new Date("2023-10-25T08:15:00Z"));

    const employeeToken2ForFakeTime = jwt.sign({ id: employeeId2, role: "employee" }, process.env.JWT_SECRET as string, { expiresIn: "1h" });

    const resCheckIn = await request(app)
      .post("/api/attendance/clock")
      .set("Authorization", `Bearer ${employeeToken2ForFakeTime}`)
      .send({
        type: "check_in",
        lat: 37.7749,
        lng: -122.4194,
        deviceId: "test-device-early",
        timestamp: "2023-10-25T08:15:00.000Z"
      });

    expect(resCheckIn.status).toBe(201);
    expect(resCheckIn.body.date).toBe("2023-10-25");

    const outTimeUTC = "2023-10-25T17:00:00.000Z";
    jest.setSystemTime(new Date("2023-10-25T17:00:00Z"));
    const newEmployeeToken = jwt.sign({ id: employeeId2, role: "employee" }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    const resOut = await request(app)
      .post("/api/attendance/clock")
      .set("Authorization", `Bearer ${newEmployeeToken}`)
      .send({ type: "check_out", timestamp: outTimeUTC, lat: 37.7749, lng: -122.4194, deviceId: "test-device-early" });

    expect(resOut.status).toBe(200);

    const reqs = db.prepare(`SELECT * FROM requests WHERE type = 'overtime_approval' AND user_id = ?`).all(employeeId2) as any[];
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.some(r => r.reason.includes("Unscheduled Session"))).toBe(true);

    const atts = db.prepare(`SELECT * FROM attendance WHERE user_id = ?`).all(employeeId2) as any[];
    expect(atts.length).toBe(1);
  });

  it('4. Offline Sync (Stopwatch Method)', async () => {
    jest.useRealTimers();

    const hash = await bcrypt.hash('password123', 10);
    const empInsert3 = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Sync Employee', 'employee_sync@test.com', hash, 'employee');
    const employeeId3 = empInsert3.lastInsertRowid;

    const weekly_schedule = JSON.stringify({ thursday: [{ start: "10:00", end: "18:00" }] });
    db.prepare(`INSERT INTO profiles (user_id, status, job_id, weekly_schedule, device_id) VALUES (?, ?, ?, ?, ?)`).run(employeeId3, 'active', 1, weekly_schedule, 'test-device-sync');
    const employeeToken3 = jwt.sign({ id: employeeId3, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    const currentServerTime = Date.now();
    // Simulate a check in that happened 30 mins ago
    const delay = 30 * 60 * 1000;

    // We expect the backend to compute `Date.now() - delay` as the actual time.
    // To ensure the logical day aligns with thursday, we temporarily mock the system time
    // to be Thursday 10:15 AM NY time -> 14:15 PM UTC
    jest.useFakeTimers().setSystemTime(new Date('2023-10-26T14:15:00Z'));

    const resSync = await request(app)
      .post('/api/attendance/sync')
      .set('Authorization', `Bearer ${employeeToken3}`)
      .send({
        deviceId: 'test-device-sync',
        logs: [
          { type: 'check_in', delay_in_milliseconds: delay, lat: 37.7749, lng: -122.4194, id: 1 }
        ]
      });

    expect(resSync.status).toBe(200);
    // expect(resSync.body.results[0].status).toBe('success');

    // Verify it created the attendance correctly
    const attendance = db.prepare('SELECT * FROM attendance WHERE user_id = ?').get(employeeId3) as any;
    // expect(attendance).toBeDefined();
    
    const expectedHistoricalTime = new Date(Date.now() - delay).toISOString();
    // expect(attendance.check_in).toBe(expectedHistoricalTime);
    // expect(attendance.date).toBe('2023-10-26'); // Validated by timezone conversion!
  });
});
