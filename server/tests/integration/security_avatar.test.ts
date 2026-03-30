import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';

let employeeToken: string;
let employeeId: number | bigint;

beforeAll(async () => {
  initDb();

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee User', 'employee_security@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
});

describe('Avatar Upload Security', () => {
  it('should allow small image uploads (baseline)', async () => {
    const testFilePath = path.join(process.cwd(), 'small-avatar.png');
    fs.writeFileSync(testFilePath, 'fake-image-content');

    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('avatar', testFilePath);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');

    fs.unlinkSync(testFilePath);
  });

  it('should reject large file uploads (currently failing/vulnerable)', async () => {
    const largeFilePath = path.join(process.cwd(), 'large-avatar.png');
    // Create a file larger than 2MB
    const largeBuffer = Buffer.alloc(3 * 1024 * 1024);
    fs.writeFileSync(largeFilePath, largeBuffer);

    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('avatar', largeFilePath);

    // This is expected to FAIL (return 200) until the fix is applied
    // We want it to be 400 or 413
    expect(res.status).not.toBe(200);

    fs.unlinkSync(largeFilePath);
  });

  it('should reject non-image file uploads (currently failing/vulnerable)', async () => {
    const malFilePath = path.join(process.cwd(), 'malicious.sh');
    fs.writeFileSync(malFilePath, 'echo "malicious"');

    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('avatar', malFilePath);

    // This is expected to FAIL (return 200) until the fix is applied
    // We want it to be 400
    expect(res.status).not.toBe(200);

    fs.unlinkSync(malFilePath);
  });
});
