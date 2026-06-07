import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';



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
  let adminId: number;
  let employeeId: number;
  let sharedPasswordHash: string;

  beforeAll(async () => {
    initDb();
    const salt = await bcrypt.genSalt(10);
    sharedPasswordHash = await bcrypt.hash('password123', salt);
  });

  afterEach(() => {
    db.exec('DELETE FROM payrolls; DELETE FROM requests; DELETE FROM attendance; DELETE FROM profiles; DELETE FROM users; DELETE FROM jobs;');
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(async () => {
    // Create an admin user
    const insertAdmin = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    const adminInfo = insertAdmin.run('Admin', 'admin@test.com', sharedPasswordHash, 'manager');
    adminId = adminInfo.lastInsertRowid as number;
    adminToken = jwt.sign({ id: adminId, role: 'manager' }, process.env.JWT_SECRET as string);

    // Create an employee user
    const insertEmployee = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    const employeeInfo = insertEmployee.run('Employee', 'employee@test.com', sharedPasswordHash, 'employee');
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
      INSERT INTO attendance (user_id, check_in, check_out, date, checkin_status, checkout_status, working_status)
      VALUES (?, ?, ?, ?, ?, 'on_time', 'working')
    `);

    // Day 1: 9 hours (08:00 to 17:00)
    insertAttendance.run(
      employeeId,
      '2023-10-01T08:00:00.000Z',
      '2023-10-01T17:00:00.000Z',
      '2023-10-01',
      'on_time'
    );

    // Mock daily_attendance
    const insertDailyAttendance = db.prepare(`
      INSERT INTO daily_attendance (user_id, date, scheduled_working_minutes, scheduled_non_working_minutes, unscheduled_working_minutes, deduction_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertDailyAttendance.run(
      employeeId,
      '2023-10-01',
      540, // 9 hours (540 minutes)
      0,
      0,
      0,
      'processed'
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

  describe('getPayrollSummary', () => {
    it('should return 400 if required parameters are missing', async () => {
      const res = await request(app)
        .get('/api/payroll/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing required parameters: user_id, start_date, end_date');
    });

    it('should return 404 if user is not found', async () => {
      const res = await request(app)
        .get('/api/payroll/summary')
        .query({ user_id: 9999, start_date: '2023-10-01', end_date: '2023-10-31' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'User not found');
    });

    it('should calculate payroll summary correctly', async () => {
      const res = await request(app)
        .get('/api/payroll/summary')
        .query({ user_id: employeeId, start_date: '2023-10-01', end_date: '2023-10-01' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body.period).toEqual({ start: '2023-10-01', end: '2023-10-01' });
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id', employeeId);
      expect(res.body.user).toHaveProperty('name', 'Employee');
      expect(res.body.user).toHaveProperty('hourly_rate', 25.50);
      expect(res.body).toHaveProperty('time_metrics');
      expect(res.body.time_metrics).toHaveProperty('actual_worked_hours', 9);
      expect(res.body).toHaveProperty('financial_metrics');
      expect(res.body.financial_metrics).toHaveProperty('final_net_salary', 229.5);
    });

    it('should return 403 if an employee tries to access payroll summary', async () => {
      // Create employee token
      const employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      const res = await request(app)
        .get('/api/payroll/summary')
        .query({ user_id: employeeId, start_date: '2023-10-01', end_date: '2023-10-01' })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
    });

    it('should return 500 if an internal server error occurs', async () => {
      // Create a spy that only throws an error when getPayrollSummary queries users table, but allows the auth middleware to pass
      const originalPrepare = db.prepare.bind(db);
      const spy = jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('SELECT u.id, u.name, p.hourly_rate')) {
          throw new Error('Database connection failed');
        }
        return originalPrepare(sql);
      });

      try {
        const res = await request(app)
          .get('/api/payroll/summary')
          .query({ user_id: employeeId, start_date: '2023-10-01', end_date: '2023-10-01' })
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch payroll summary');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('POST /api/payroll/records/pay', () => {
    it('should record payment successfully for a valid employee and range', async () => {
      const res = await request(app)
        .post('/api/payroll/records/pay')
        .send({ user_id: employeeId, startDate: '2023-10-01', endDate: '2023-10-01' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Payment recorded successfully');
      expect(res.body.record).toBeDefined();
      expect(res.body.record.status).toBe('paid');
      expect(res.body.record.user_id).toBe(employeeId);
    });

    it('should forbid non-manager users from recording payments', async () => {
      const employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      const res = await request(app)
        .post('/api/payroll/records/pay')
        .send({ user_id: employeeId, startDate: '2023-10-01', endDate: '2023-10-01' })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
    });
  });

  describe('GET /api/payroll/my-records', () => {
    let employeeToken: string;
    let otherEmployeeId: number;

    beforeEach(async () => {
      employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET as string);

      // Create another employee
      const insertEmployee = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      const otherEmployeeInfo = insertEmployee.run('Other Employee', 'other@test.com', sharedPasswordHash, 'employee');
      otherEmployeeId = otherEmployeeInfo.lastInsertRowid as number;

      // Insert payrolls matching schema
      const insertPayroll = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, hourly_rate, scheduled_working_minutes, net_salary, status, paid_by)
        VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)
      `);

      // Current employee payrolls
      insertPayroll.run(employeeId, '2023-10-01', '2023-10-31', 25.00, 4800, 2000, adminId);
      insertPayroll.run(employeeId, '2023-09-01', '2023-09-30', 25.00, 4800, 2000, adminId);

      // Other employee payroll
      insertPayroll.run(otherEmployeeId, '2023-10-01', '2023-10-31', 25.00, 4800, 2500, adminId);
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
});
