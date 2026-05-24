import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;
let employeeToken: string;
let employeeId: number | bigint;
let requestId: number | bigint;

beforeAll(async () => {
  initDb();
  
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  
  // Create manager
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager', 'manager_req@test.com', hash, 'manager');
  managerToken = jwt.sign({ id: managerInsert.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_req@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
});

/**
 * @scenario Verifies the submission and managerial approval/rejection of employee requests (e.g., overtime, leave).
 * @expectedLogic
 *   - Employees can submit leave or manual check-in requests.
 *   - Managers can review, approve, or reject these requests, triggering respective state changes.
 * @edgeCases
 *   - Processing a request that does not exist or has already been reviewed.
 */
describe('Requests API', () => {
  it('should allow employee to submit a request', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        reason: 'Sick leave',
        requested_check_in: new Date().toISOString(),
        requested_check_out: new Date().toISOString()
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.reason).toBe('Sick leave');
    expect(res.body.status).toBe('pending');
    
    requestId = res.body.id;
  });

  it('should return 400 if reason is missing', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        requested_check_in: new Date().toISOString()
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Reason is required');
  });

  it('should allow manager to fetch all requests', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${managerToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('user_name');
  });

  it('should deny employee from approving a request', async () => {
    const res = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'approved' });
    
    expect(res.status).toBe(403); // Assuming authorize(['manager']) is used
  });

  it('should allow manager to approve a request', async () => {
    const res = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved' });
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });


  it('should return 400 if trying to process a rejected request to approved', async () => {
    // 1. Create a new request
    const createRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        reason: 'Vacation',
        requested_check_in: new Date().toISOString(),
        requested_check_out: new Date().toISOString()
      });
    expect(createRes.status).toBe(201);
    const newReqId = createRes.body.id;

    // 2. Reject the request
    const rejectRes = await request(app)
      .put(`/api/requests/${newReqId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'rejected', manager_note: 'Denied' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('rejected');

    // 3. Attempt to approve the already rejected request
    const approveRes = await request(app)
      .put(`/api/requests/${newReqId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Changed my mind' });

    // 4. Assertions
    expect(approveRes.status).toBe(400);
    expect(approveRes.body).toHaveProperty('error', 'Request is already processed');
    expect(approveRes.body).toHaveProperty('errorCode', 'ERR_ALREADY_PROCESSED');
    expect(approveRes.body).toHaveProperty('currentStatus', 'rejected');
  });

  it('should return 400 if trying to process an already processed request', async () => {
    const res = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'rejected', manager_note: 'Rejected' });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Request is already processed');
    expect(res.body).toHaveProperty('errorCode', 'ERR_ALREADY_PROCESSED');
    expect(res.body).toHaveProperty('currentStatus', 'approved');
  });

  it('should allow employee to submit attendance correction request', async () => {
    // Create attendance record
    const attInsert = db.prepare(`INSERT INTO attendance (user_id, check_in, check_out, date) VALUES (?, ?, ?, ?)`).run(employeeId, new Date().toISOString(), new Date().toISOString(), new Date().toISOString().split('T')[0]);
    const attendanceId = attInsert.lastInsertRowid;

    const res = await request(app)
      .post('/api/requests/attendance-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendance_id: attendanceId,
        new_clock_in: new Date().toISOString(),
        new_clock_out: new Date().toISOString(),
        reason: 'Forgot to clock out'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('attendance_correction');
    
    // Approve it
    const approveRes = await request(app)
      .put(`/api/requests/${res.body.id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved' });
    
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('approved');
    
    // Verify attendance update
    const attendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(attendanceId) as any;
    expect(attendance.check_in).toBeDefined();
    expect(attendance.check_out).toBeDefined();
  });

  it('should cascade delete or update related requests and payroll transactions when attendance correction is approved', async () => {
    // 1. Create a shift instance (Scheduled)
    const testDate = '2026-05-24';
    const shiftStart = '2026-05-24T09:00:00.000Z';
    const shiftEnd = '2026-05-24T17:00:00.000Z';
    const shiftInsert = db.prepare(`
      INSERT INTO shift_instances (user_id, start_time, end_time, logical_date, status)
      VALUES (?, ?, ?, ?, 'Scheduled')
    `).run(employeeId, shiftStart, shiftEnd, testDate);
    const shiftId = shiftInsert.lastInsertRowid;

    // 2. Create profile with weekly schedule
    db.prepare('UPDATE profiles SET weekly_schedule = ? WHERE user_id = ?').run(
      JSON.stringify({
        sunday: [{ start: '09:00', end: '17:00' }]
      }),
      employeeId
    );

    // 3. Create attendance: checked in late (09:45) and checked out early (16:15)
    const checkInLate = '2026-05-24T09:45:00.000Z'; // 45 mins late
    const checkOutEarly = '2026-05-24T16:15:00.000Z'; // 45 mins early
    const attInsert = db.prepare(`
      INSERT INTO attendance (user_id, check_in, check_out, date, status, shift_id)
      VALUES (?, ?, ?, ?, 'late_in', ?)
    `).run(employeeId, checkInLate, checkOutEarly, testDate, shiftId.toString());
    const attendanceId = attInsert.lastInsertRowid;

    // 4. Create late_in_approval and early_leave_approval requests
    const lateReqInsert = db.prepare(`
      INSERT INTO requests (user_id, attendance_id, type, reason, value, status)
      VALUES (?, ?, 'late_in_approval', 'Late in', 45, 'approved')
    `).run(employeeId, attendanceId);
    const lateReqId = lateReqInsert.lastInsertRowid;

    const earlyReqInsert = db.prepare(`
      INSERT INTO requests (user_id, attendance_id, type, reason, value, status)
      VALUES (?, ?, 'early_leave_approval', 'Early out', 45, 'approved')
    `).run(employeeId, attendanceId);
    const earlyReqId = earlyReqInsert.lastInsertRowid;

    // Create payroll transactions linked to these approved requests
    db.prepare(`
      INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status)
      VALUES (1, ?, 'late_deduction', 0.75, 15, 'applied')
    `).run(lateReqId);

    db.prepare(`
      INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status)
      VALUES (1, ?, 'step_away_unpaid', 0.75, 15, 'applied')
    `).run(earlyReqId);

    // 5. Submit an attendance correction request correcting check_in to 09:00 (on time) and check_out to 17:00 (on time)
    const correctionRes = await request(app)
      .post('/api/requests/attendance-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendance_id: attendanceId,
        new_clock_in: '2026-05-24T09:00:00.000Z',
        new_clock_out: '2026-05-24T17:00:00.000Z',
        reason: 'Correction to on time'
      });
    expect(correctionRes.status).toBe(201);
    const correctionId = correctionRes.body.id;

    // 6. Approve the correction request
    const approveRes = await request(app)
      .put(`/api/requests/${correctionId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved correction' });
    expect(approveRes.status).toBe(200);

    // 7. Verify that late_in and early_leave requests are completely deleted
    const lateReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(lateReqId);
    expect(lateReq).toBeUndefined();

    const earlyReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(earlyReqId);
    expect(earlyReq).toBeUndefined();

    // Verify payroll transactions are deleted
    const lateTx = db.prepare('SELECT * FROM payroll_transactions WHERE reference_id = ?').get(lateReqId);
    expect(lateTx).toBeUndefined();
    const earlyTx = db.prepare('SELECT * FROM payroll_transactions WHERE reference_id = ?').get(earlyReqId);
    expect(earlyTx).toBeUndefined();
  });

  it('should reset value and status to pending for related requests when corrected times still exceed grace period', async () => {
    // Reset DB state for clean test run
    db.prepare('DELETE FROM shift_instances').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM requests').run();
    db.prepare('DELETE FROM payroll_transactions').run();

    const testDate = '2026-05-24';
    const shiftStart = '2026-05-24T09:00:00.000Z';
    const shiftEnd = '2026-05-24T17:00:00.000Z';
    const shiftInsert = db.prepare(`
      INSERT INTO shift_instances (user_id, start_time, end_time, logical_date, status)
      VALUES (?, ?, ?, ?, 'Scheduled')
    `).run(employeeId, shiftStart, shiftEnd, testDate);
    const shiftId = shiftInsert.lastInsertRowid;

    // Checked in late (09:45) and checked out on time (17:00)
    const checkInLate = '2026-05-24T09:45:00.000Z';
    const checkOutTime = '2026-05-24T17:00:00.000Z';
    const attInsert = db.prepare(`
      INSERT INTO attendance (user_id, check_in, check_out, date, status, shift_id)
      VALUES (?, ?, ?, ?, 'late_in', ?)
    `).run(employeeId, checkInLate, checkOutTime, testDate, shiftId.toString());
    const attendanceId = attInsert.lastInsertRowid;

    // Create late_in_approval request
    const lateReqInsert = db.prepare(`
      INSERT INTO requests (user_id, attendance_id, type, reason, value, status)
      VALUES (?, ?, 'late_in_approval', 'Late in', 45, 'approved')
    `).run(employeeId, attendanceId);
    const lateReqId = lateReqInsert.lastInsertRowid;

    // Create payroll transaction
    db.prepare(`
      INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status)
      VALUES (1, ?, 'late_deduction', 0.75, 15, 'applied')
    `).run(lateReqId);

    // Correct to 09:30 (still late by 30 mins, exceeding grace period of 15 mins)
    const correctionRes = await request(app)
      .post('/api/requests/attendance-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendance_id: attendanceId,
        new_clock_in: '2026-05-24T09:30:00.000Z',
        reason: 'Slight correction'
      });
    expect(correctionRes.status).toBe(201);
    const correctionId = correctionRes.body.id;

    // Approve the correction
    const approveRes = await request(app)
      .put(`/api/requests/${correctionId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved correction' });
    expect(approveRes.status).toBe(200);

    // Verify late_in request was reset to pending with value = 30
    const lateReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(lateReqId) as any;
    expect(lateReq).toBeDefined();
    expect(lateReq.status).toBe('pending');
    expect(lateReq.value).toBe(30);

    // Verify payroll transaction was deleted
    const lateTx = db.prepare('SELECT * FROM payroll_transactions WHERE reference_id = ?').get(lateReqId);
    expect(lateTx).toBeUndefined();
  });

  it('should prevent approving a request if the approved minutes exceed the maximum duration', async () => {
    const testDate = '2026-05-24';
    const shiftStart = '2026-05-24T09:00:00.000Z';
    const shiftEnd = '2026-05-24T17:00:00.000Z';
    const shiftInsert = db.prepare(`
      INSERT INTO shift_instances (user_id, start_time, end_time, logical_date)
      VALUES (?, ?, ?, ?)
    `).run(employeeId, shiftStart, shiftEnd, testDate);
    const shiftId = shiftInsert.lastInsertRowid;

    const checkInLate = '2026-05-24T09:45:00.000Z';
    const checkOutTime = '2026-05-24T17:00:00.000Z';
    const attInsert = db.prepare(`
      INSERT INTO attendance (user_id, check_in, check_out, date, status, shift_id)
      VALUES (?, ?, ?, ?, 'late_in', ?)
    `).run(employeeId, checkInLate, checkOutTime, testDate, shiftId.toString());
    const attendanceId = attInsert.lastInsertRowid;

    const reqInsert = db.prepare(`
      INSERT INTO requests (user_id, attendance_id, type, reason, value, status)
      VALUES (?, ?, 'late_in_approval', 'Late in request', 45, 'pending')
    `).run(employeeId, attendanceId);
    const requestId = reqInsert.lastInsertRowid;

    // Approve the request with 50 minutes (which is greater than 45)
    const approveRes = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved', paid_minutes: 50 });
    expect(approveRes.status).toBe(400);
    expect(approveRes.body.error).toContain('cannot exceed the maximum allowed period');

    // Approve the request with 45 minutes (which is valid)
    const approveValidRes = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', manager_note: 'Approved', paid_minutes: 45 });
    expect(approveValidRes.status).toBe(200);
  });

  it('should prevent creating an attendance correction that exceeds shift scheduled start and end times', async () => {
    const testDate = '2026-05-25';
    const shiftStart = '2026-05-25T09:00:00.000Z';
    const shiftEnd = '2026-05-25T17:00:00.000Z';
    const shiftInsert = db.prepare(`
      INSERT INTO shift_instances (user_id, start_time, end_time, logical_date)
      VALUES (?, ?, ?, ?)
    `).run(employeeId, shiftStart, shiftEnd, testDate);
    const shiftId = shiftInsert.lastInsertRowid;

    const checkIn = '2026-05-25T09:15:00.000Z';
    const checkOut = '2026-05-25T16:45:00.000Z';
    const attInsert = db.prepare(`
      INSERT INTO attendance (user_id, check_in, check_out, date, status, shift_id)
      VALUES (?, ?, ?, ?, 'late_in', ?)
    `).run(employeeId, checkIn, checkOut, testDate, shiftId.toString());
    const attendanceId = attInsert.lastInsertRowid;

    // Attempting correction check-in before shift start time (e.g. 08:50)
    const correctionRes1 = await request(app)
      .post('/api/requests/attendance-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendance_id: attendanceId,
        new_clock_in: '2026-05-25T08:50:00.000Z',
        reason: 'Too early check-in correction'
      });
    expect(correctionRes1.status).toBe(400);
    expect(correctionRes1.body.error).toContain('cannot be earlier than the scheduled shift start time');

    // Attempting correction check-out after shift end time (e.g. 17:10)
    const correctionRes2 = await request(app)
      .post('/api/requests/attendance-correction')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendance_id: attendanceId,
        new_clock_out: '2026-05-25T17:10:00.000Z',
        reason: 'Too late check-out correction'
      });
    expect(correctionRes2.status).toBe(400);
    expect(correctionRes2.body.error).toContain('cannot be later than the scheduled shift end time');
  });
});
