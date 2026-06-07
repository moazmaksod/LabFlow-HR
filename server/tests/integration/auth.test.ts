
import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';

beforeAll(() => {
  initDb();
  // Clear tables to ensure a clean state for tests
  db.prepare('DELETE FROM profiles').run();
  db.prepare('DELETE FROM users').run();
});

afterAll(() => {
  db.close();
});

/**
 * @scenario Tests JWT-based authentication for Web (Manager) and Mobile (Employee) logins.
 * @expectedLogic
 *   - Managers can login via web without a deviceId.
 *   - Employees receive a 403 Access Denied if attempting to login via Web.
 *   - Employees can successfully login using their Device ID (Mobile).
 * @edgeCases
 *   - Incorrect passwords, unregistered emails, and role-based access restrictions.
 */
describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        date_of_birth: '1998-01-01',
        gender: 'male'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('name', 'Test User');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body.user).toHaveProperty('role', 'pending');
  });

  describe('POST /api/auth/register - Error Handling', () => {
    it('should return 500 when database insertion fails', async () => {
      // Create a temporary spy on db.prepare to force an error on the 'INSERT' query
      const originalPrepare = db.prepare;
      const prepareSpy = jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO users')) {
          return {
            run: () => {
              throw new Error('Forced Database Insertion Error');
            }
          } as any;
        }
        return originalPrepare.call(db, sql);
      });

      // Suppress console.error expected during this test
      const originalConsoleError = console.error;
      console.error = jest.fn();

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Error User',
          email: 'erroruser2@example.com',
          password: 'password123',
          date_of_birth: '1998-01-01',
          gender: 'male'
        });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Internal server error');

      // Restore the original function and console.error
      prepareSpy.mockRestore();
      console.error = originalConsoleError;
    });
  });

  describe('POST /api/auth/register - Validation Logic', () => {
    it('should not register a user with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Incomplete User',
          // missing email, password, age, gender
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing required fields: name, email, password, date_of_birth, gender');
    });

    it('should not register a user with invalid date_of_birth (not a string)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid Age User',
          email: 'invalidage1@example.com',
          password: 'password123',
          age: 'thirty',
          gender: 'male'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing required fields: name, email, password, date_of_birth, gender');
    });

    it('should not register a user with missing date_of_birth', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Young User',
          email: 'young@example.com',
          password: 'password123',

          gender: 'female'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing required fields: name, email, password, date_of_birth, gender');
    });

    it('should not register a user with empty date_of_birth', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Old User',
          email: 'old@example.com',
          password: 'password123',
          date_of_birth: '',
          gender: 'male'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Missing required fields: name, email, password, date_of_birth, gender');
    });

    it('should not register a user with invalid gender', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid Gender User',
          email: 'invalidgender@example.com',
          password: 'password123',
          date_of_birth: '1998-01-01',
          gender: 'other' // Only "male" or "female" are allowed
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid gender. Must be "male" or "female".');
    });
  });

  it('should not register a user with an existing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: 'test@example.com',
        password: 'password123',
        date_of_birth: '1993-01-01',
        gender: 'female'
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email already in use');
  });

  it('should not register a user with an existing email (case-insensitive)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: 'TEST@example.com',
        password: 'password123',
        date_of_birth: '1993-01-01',
        gender: 'female'
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email already in use');
  });

  it('should login an existing user (Manager) without deviceId (Web)', async () => {
    // Promote user to manager
    db.prepare("UPDATE users SET role = 'manager' WHERE email = ?").run('test@example.com');

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'manager');
  });

  it('should login an Employee without deviceId (Web) because it is now optional', async () => {
    // Register an employee
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Employee User',
        email: 'employee@example.com',
        password: 'password123',
        date_of_birth: '1998-01-01',
        gender: 'male'
      });
    
    // Promote to employee
    db.prepare("UPDATE users SET role = 'employee' WHERE email = ?").run('employee@example.com');

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employee@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Access Denied: Only administrators are allowed to login from the web application.');
  });

  it('should login an Employee with deviceId (Mobile)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employee@example.com',
        password: 'password123',
        deviceId: 'device-123'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'employee');
  });

  it('should not login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });
});
