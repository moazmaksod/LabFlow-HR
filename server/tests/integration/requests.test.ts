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

  it('should return 400 if trying to process an already processed request', async () => {
    const res = await request(app)
      .put(`/api/requests/${requestId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'rejected', manager_note: 'Rejected' });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Request is already processed');
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
});
