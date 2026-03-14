import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';

let employeeToken: string;
let employeeId: number | bigint;
let managerToken: string;
let managerId: number | bigint;

beforeAll(async () => {
  initDb();
  
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);

  // Create manager
  const mgrInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager User', 'manager_user@test.com', hash, 'manager');
  managerId = mgrInsert.lastInsertRowid;
  managerToken = jwt.sign({ id: managerId, role: 'manager' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee User', 'employee_user@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create manager
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager User', 'manager_user@test.com', hash, 'manager');
  managerId = managerInsert.lastInsertRowid;
  managerToken = jwt.sign({ id: managerId, role: 'manager' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create profile for employee with a device_id
  db.prepare(`INSERT INTO profiles (user_id, status, device_id) VALUES (?, ?, ?)`).run(employeeId, 'active', 'test-device-id-123');
});

afterAll(() => {
  db.close();
});

describe('User Profile API', () => {
  it('should allow employee to update their profile details', async () => {
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Updated Name',
        age: 25,
        gender: 'Male'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.age).toBe(25);
    expect(res.body.gender).toBe('Male');
  });

  it('should allow employee to upload an avatar', async () => {
    // Create a dummy file for testing
    const testFilePath = path.join(process.cwd(), 'test-avatar.png');
    fs.writeFileSync(testFilePath, 'fake-image-content');

    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('avatar', testFilePath);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body.url).toMatch(/^\/uploads\//);

    // Cleanup
    fs.unlinkSync(testFilePath);
  });

  it('should update profile_picture_url after upload', async () => {
    const avatarUrl = '/uploads/test-avatar.png';
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        profile_picture_url: avatarUrl
      });
    
    expect(res.status).toBe(200);
    expect(res.body.profile_picture_url).toBe(avatarUrl);
  });

  describe('resetDevice', () => {
    it('should deny employee from resetting a device', async () => {
      const res = await request(app)
        .put(`/api/users/${employeeId}/reset-device`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow manager to reset a device', async () => {
      // Verify device_id is present initially
      let profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(employeeId) as any;
      expect(profile.device_id).toBe('test-device-id-123');

      const res = await request(app)
        .put(`/api/users/${employeeId}/reset-device`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Device binding reset successfully');

      // Verify device_id is now NULL
      profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(employeeId) as any;
      expect(profile.device_id).toBeNull();
    });
  });
});

describe('User Management API (Manager)', () => {
  it('should return 403 when an employee tries to fetch users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should allow manager to fetch all users (excluding managers)', async () => {
    // Add a pending user to ensure we fetch more than just the employee
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('password123', salt);
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Pending User', 'pending_user@test.com', hash, 'pending');

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Should contain the employee and pending user, but not the manager
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    // Ensure no managers are in the results
    const managerUsers = res.body.filter((u: any) => u.role === 'manager');
    expect(managerUsers.length).toBe(0);

    // Verify properties of returned objects
    const firstUser = res.body[0];
    expect(firstUser).toHaveProperty('id');
    expect(firstUser).toHaveProperty('name');
    expect(firstUser).toHaveProperty('email');
    expect(firstUser).toHaveProperty('role');
    expect(firstUser).toHaveProperty('created_at');
    // these are returned from LEFT JOIN, could be null
    expect(firstUser).toHaveProperty('status');
    expect(firstUser).toHaveProperty('job_id');
    expect(firstUser).toHaveProperty('job_title');
    expect(firstUser).toHaveProperty('current_status');
  });
});
