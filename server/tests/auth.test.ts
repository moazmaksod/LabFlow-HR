import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';

beforeAll(() => {
  initDb();
  // Clear tables to ensure a clean state for tests
  db.prepare('DELETE FROM profiles').run();
  db.prepare('DELETE FROM users').run();
});

afterAll(() => {
  db.close();
});

describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        age: 25,
        gender: 'male'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('name', 'Test User');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body.user).toHaveProperty('role', 'pending');
  });

  it('should not register a user with an existing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: 'test@example.com',
        password: 'password123',
        age: 30,
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
        age: 30,
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

  it('should not login an Employee without deviceId (Web)', async () => {
    // Register an employee
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Employee User',
        email: 'employee@example.com',
        password: 'password123',
        age: 25,
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
