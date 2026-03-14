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
let pendingUserId: number | bigint;
let jobId: number | bigint;

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

  // Create pending user
  const pendingInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Pending User', 'pending_user@test.com', hash, 'pending');
  pendingUserId = pendingInsert.lastInsertRowid;

  // Create a job
  const jobInsert = db.prepare(`INSERT INTO jobs (title, hourly_rate, required_hours) VALUES (?, ?, ?)`).run('Test Engineer', 20.0, 40.0);
  jobId = jobInsert.lastInsertRowid;
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
});

describe('User Role Update API', () => {
  it('should deny role update for non-managers', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ role: 'employee' });

    expect(res.status).toBe(403);
  });

  it('should reject role update with empty role', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid role');
  });

  it('should reject role update with invalid role', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid role');
  });

  it('should allow manager to update pending user to employee and create profile', async () => {
    const res = await request(app)
      .put(`/api/users/${pendingUserId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'employee', job_id: jobId });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('employee');
    expect(res.body.job_id).toBe(Number(jobId));
    expect(res.body.status).toBe('active');

    // Verify database
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(pendingUserId) as any;
    expect(profile).toBeDefined();
    expect(profile.job_id).toBe(Number(jobId));
    expect(profile.status).toBe('active');
  });

  it('should allow manager to update employee role to manager and update existing profile', async () => {
    const res = await request(app)
      .put(`/api/users/${employeeId}/role`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'manager', job_id: jobId });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('manager');
    expect(res.body.job_id).toBe(Number(jobId));

    // Verify database
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(employeeId) as any;
    expect(profile).toBeDefined();
    expect(profile.job_id).toBe(Number(jobId));
  });
});
