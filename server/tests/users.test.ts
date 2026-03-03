import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;
let employeeToken: string;
let pendingUserId: number | bigint;

beforeAll(async () => {
  initDb();
  
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  
  // Create manager
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager', 'manager_users@test.com', hash, 'manager');
  managerToken = jwt.sign({ id: managerInsert.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_users@test.com', hash, 'employee');
  employeeToken = jwt.sign({ id: empInsert.lastInsertRowid, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create pending user
  const pendingInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Pending User', 'pending_users@test.com', hash, 'pending');
  pendingUserId = pendingInsert.lastInsertRowid;
});

afterAll(() => {
  db.close();
});

describe('Users API', () => {
  it('should allow manager to fetch all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${managerToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    
    // Check if the pending user is in the list
    const pendingUser = res.body.find((u: any) => u.email === 'pending_users@test.com');
    expect(pendingUser).toBeDefined();
    expect(pendingUser.role).toBe('pending');
  });

  it('should deny employee from fetching all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${employeeToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should allow manager to update a user role', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'employee' });
    
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('employee');
    expect(res.body.status).toBe('active'); // Profile should be created/updated to active
  });

  it('should deny employee from updating a user role', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ role: 'manager' });
    
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should return 400 for invalid role', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'superadmin' });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid role');
  });
});
