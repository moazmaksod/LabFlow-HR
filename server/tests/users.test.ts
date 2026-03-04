import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';

let employeeToken: string;
let employeeId: number | bigint;

beforeAll(async () => {
  initDb();
  
  // Create employee
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee User', 'employee_user@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
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
