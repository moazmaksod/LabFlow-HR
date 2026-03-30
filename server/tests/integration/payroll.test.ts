import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

beforeAll(async () => {
  initDb();
});

afterEach(() => {
  db.exec('DELETE FROM users; DELETE FROM attendance; DELETE FROM profiles; DELETE FROM requests; DELETE FROM jobs; DELETE FROM payrolls; DELETE FROM payroll_transactions;');
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

  describe('GET /api/payroll/my-records', () => {
    let employeeToken: string;
    let otherEmployeeId: number;

    beforeEach(async () => {
      employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      // Create another employee
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);
      const insertEmployee = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      const otherEmployeeInfo = insertEmployee.run('Other Employee', 'other@test.com', passwordHash, 'employee');
      otherEmployeeId = otherEmployeeInfo.lastInsertRowid as number;

      // Insert payrolls
      const insertPayroll = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, base_salary, net_salary, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Current employee payrolls
      insertPayroll.run(employeeId, '2023-10-01', '2023-10-31', 2000, 2000, 'finalized');
      insertPayroll.run(employeeId, '2023-09-01', '2023-09-30', 2000, 2000, 'paid');

      // Other employee payroll
      insertPayroll.run(otherEmployeeId, '2023-10-01', '2023-10-31', 2500, 2500, 'finalized');
    });

    it('should return all payrolls for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/payroll/my-records')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      res.body.forEach((payroll: any) => {
        expect(payroll.user_id).toBe(employeeId);
      });
    });

    it('should filter payrolls by month and year', async () => {
      const res = await request(app)
        .get('/api/payroll/my-records')
        .query({ month: 10, year: 2023 })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].start_date).toBe('2023-10-01');
    });

    it('should return an empty array if no payrolls match the filters', async () => {
      const res = await request(app)
        .get('/api/payroll/my-records')
        .query({ month: 1, year: 2024 })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });

    it('should not return payrolls belonging to other users', async () => {
      const res = await request(app)
        .get('/api/payroll/my-records')
        .set('Authorization', `Bearer ${employeeToken}`);

      const otherPayroll = res.body.find((p: any) => p.user_id === otherEmployeeId);
      expect(otherPayroll).toBeUndefined();
    });
  });

  describe('GET /api/payroll/my-records/:payroll_id/transactions', () => {
    let employeeToken: string;
    let employeePayrollId: number;
    let otherEmployeePayrollId: number;

    beforeEach(async () => {
      employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      // Create another employee
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);
      const insertEmployee = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      const otherEmployeeInfo = insertEmployee.run('Other Employee', 'other@test.com', passwordHash, 'employee');
      const otherEmployeeId = otherEmployeeInfo.lastInsertRowid as number;

      // Insert payrolls
      const insertPayroll = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, base_salary, net_salary, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const p1 = insertPayroll.run(employeeId, '2023-10-01', '2023-10-31', 2000, 2050, 'finalized');
      employeePayrollId = p1.lastInsertRowid as number;

      const p2 = insertPayroll.run(otherEmployeeId, '2023-10-01', '2023-10-31', 2500, 2500, 'finalized');
      otherEmployeePayrollId = p2.lastInsertRowid as number;

      // Insert transactions
      const insertTransaction = db.prepare(`
        INSERT INTO payroll_transactions (payroll_id, type, amount, status)
        VALUES (?, ?, ?, ?)
      `);
      insertTransaction.run(employeePayrollId, 'bonus', 50, 'applied');
      insertTransaction.run(otherEmployeePayrollId, 'bonus', 100, 'applied');
    });

    it('should return transactions for the owned payroll', async () => {
      const res = await request(app)
        .get(`/api/payroll/my-records/${employeePayrollId}/transactions`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].payroll_id).toBe(employeePayrollId);
      expect(res.body[0].amount).toBe(50);
    });

    it('should return 403 when trying to access transactions of another user\'s payroll', async () => {
      const res = await request(app)
        .get(`/api/payroll/my-records/${otherEmployeePayrollId}/transactions`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Access denied');
    });

    it('should return 403 if the payroll does not exist', async () => {
      const res = await request(app)
        .get('/api/payroll/my-records/9999/transactions')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Access denied');
    });
  });
});
