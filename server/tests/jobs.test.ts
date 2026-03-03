import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;
let employeeToken: string;

beforeAll(async () => {
  initDb();
  
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  
  // Create manager
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager', 'manager_jobs@test.com', hash, 'manager');
  managerToken = jwt.sign({ id: managerInsert.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_jobs@test.com', hash, 'employee');
  employeeToken = jwt.sign({ id: empInsert.lastInsertRowid, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
});

describe('Jobs API', () => {
  it('should allow manager to create a new job', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: 'Software Engineer',
        hourly_rate: 45.5,
        required_hours: 8.0,
        shift_start: '09:00',
        shift_end: '17:00',
        grace_period: 15
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Software Engineer');
    expect(res.body.hourly_rate).toBe(45.5);
  });

  it('should deny employee from creating a job', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        title: 'Hacker',
        hourly_rate: 100,
        required_hours: 4.0,
        shift_start: '10:00',
        shift_end: '14:00'
      });
    
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should return 400 if required fields are missing', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: 'Incomplete Job'
        // Missing hourly_rate, required_hours, etc.
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Missing required fields');
  });

  it('should deny employee from fetching jobs list', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${employeeToken}`);
    
    expect(res.status).toBe(403);
  });

  it('should allow manager to fetch jobs list', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${managerToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('title');
  });
});
