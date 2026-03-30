import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

beforeAll(async () => {
  initDb();
});

afterEach(() => {
  db.exec('DELETE FROM users; DELETE FROM attendance; DELETE FROM profiles; DELETE FROM requests; DELETE FROM jobs;');
});

afterAll(() => {
  db.close();
});

/**
 * @scenario Validates payroll generation, wage calculations, and bonus disbursements.
 * @expectedLogic
 *   - Payroll generation iterates over completed shifts, factors in hourly_rate and overtime.
 *   - 100% Attendance Bonus is granted if total delay and absence minutes equal 0.
 * @edgeCases
 *   - Discrepancies in shift calculations, or handling pending shifts during generation.
 */
describe('Payroll API', () => {
  let adminToken: string;
  let employeeId: number;

  beforeEach(async () => {
    // Create an admin user
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    const insertAdmin = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    const adminInfo = insertAdmin.run('Admin', 'admin@test.com', passwordHash, 'manager');
    adminToken = jwt.sign({ id: adminInfo.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET as string);

    // Create an employee user
    const insertEmployee = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    const employeeInfo = insertEmployee.run('Employee', 'employee@test.com', passwordHash, 'employee');
    employeeId = employeeInfo.lastInsertRowid as number;

    // Create a job
    const insertJob = db.prepare(`
      INSERT INTO jobs (title, hourly_rate, required_hours)
      VALUES (?, ?, ?)
    `);
    const jobInfo = insertJob.run('Developer', 25.50, 8);

    // Create a profile for the employee
    const insertProfile = db.prepare(`
      INSERT INTO profiles (user_id, job_id, status, hourly_rate, weekly_schedule)
      VALUES (?, ?, ?, ?, ?)
    `);
    const schedule = JSON.stringify({
      monday: [{ start: '08:00', end: '16:00' }],
      tuesday: [{ start: '08:00', end: '16:00' }],
      wednesday: [{ start: '08:00', end: '16:00' }],
      thursday: [{ start: '08:00', end: '16:00' }],
      friday: [{ start: '08:00', end: '16:00' }]
    });
    insertProfile.run(employeeId, jobInfo.lastInsertRowid, 'active', 25.50, schedule);

    // Mock attendance logs
    const insertAttendance = db.prepare(`
      INSERT INTO attendance (user_id, check_in, check_out, date, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Day 1: 9 hours (08:00 to 17:00)
    insertAttendance.run(
      employeeId,
      '2023-10-01T08:00:00.000Z',
      '2023-10-01T17:00:00.000Z',
      '2023-10-01',
      'on_time'
    );
  });
  it('should calculate payroll correctly for a given date range', async () => {
    const res = await request(app)
      .get('/api/payroll')
      .query({ startDate: '2023-10-01', endDate: '2023-10-01' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const payrollRecord = res.body[0];
    expect(payrollRecord).toHaveProperty('user_name', 'Employee');
    expect(payrollRecord).toHaveProperty('job_title', 'Developer');
    expect(payrollRecord).toHaveProperty('hourly_rate', 25.50);
    expect(payrollRecord).toHaveProperty('total_hours', 9);
    expect(payrollRecord).toHaveProperty('total_pay', 229.5);
  });

  it('should require manager role to access payroll', async () => {
    // Create employee token
    const employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

    const res = await request(app)
      .get('/api/payroll')
      .query({ startDate: '2023-10-01', endDate: '2023-10-31' })
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should return 400 if dates are missing', async () => {
    const res = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Missing required parameters: startDate, endDate');
  });

  describe('POST /api/payroll/generate', () => {
    it('should generate draft payrolls successfully for given month and year', async () => {
      const res = await request(app)
        .post('/api/payroll/generate')
        .query({ month: '03', year: '2026' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Draft payrolls generated successfully');
      expect(Array.isArray(res.body.payrolls)).toBe(true);
      expect(res.body.payrolls.length).toBeGreaterThan(0);

      const employeePayroll = res.body.payrolls.find((p: any) => p.user_id === employeeId);
      expect(employeePayroll).toBeDefined();

      // Verify the database record
      const payrollRecord = db.prepare(`SELECT * FROM payrolls WHERE id = ?`).get(employeePayroll.payroll_id) as any;
      expect(payrollRecord).toBeDefined();
      expect(payrollRecord.status).toBe('draft');
      expect(payrollRecord.user_id).toBe(employeeId);
    });

    it('should return 400 if month is missing', async () => {
      const res = await request(app)
        .post('/api/payroll/generate')
        .query({ year: '2026' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Month and year are required');
    });

    it('should return 400 if year is missing', async () => {
      const res = await request(app)
        .post('/api/payroll/generate')
        .query({ month: '03' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Month and year are required');
    });

    it('should return 400 if both month and year are missing', async () => {
      const res = await request(app)
        .post('/api/payroll/generate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Month and year are required');
    });

    it('should forbid non-manager users from generating payrolls', async () => {
      const employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      const res = await request(app)
        .post('/api/payroll/generate')
        .query({ month: '03', year: '2026' })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
    });

  });
});
