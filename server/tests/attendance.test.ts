import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let employeeToken: string;
let employeeId: number | bigint;

beforeAll(async () => {
  initDb();
  
  // Seed settings for geofence (San Francisco)
  db.prepare(`INSERT INTO settings (id, office_lat, office_lng, radius_meters) VALUES (1, 37.7749, -122.4194, 50)`).run();

  // Create employee
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_att@test.com', hash, 'employee');
  employeeId = empInsert.lastInsertRowid;
  employeeToken = jwt.sign({ id: employeeId, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
});

describe('Attendance API', () => {
  it('should reject clock in if outside geofence', async () => {
    const res = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_in',
        timestamp: new Date().toISOString(),
        lat: 38.0, // Outside 50m radius
        lng: -122.0
      });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Away from job/);
  });

  it('should allow clock in if inside geofence', async () => {
    const res = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_in',
        timestamp: new Date().toISOString(),
        lat: 37.7749, // Exact match
        lng: -122.4194
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('check_in');
  });

  it('should reject second clock in for the same day', async () => {
    const res = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_in',
        timestamp: new Date().toISOString(),
        lat: 37.7749,
        lng: -122.4194
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Already checked in/);
  });

  it('should allow clock out if inside geofence', async () => {
    const res = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'check_out',
        timestamp: new Date().toISOString(),
        lat: 37.7749,
        lng: -122.4194
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('check_out');
  });

  it('should reject clock out if outside geofence', async () => {
    // Create a new user to test clock out outside geofence on a fresh record
    const hash = await bcrypt.hash('password123', 10);
    const empInsert2 = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee 2', 'employee_att2@test.com', hash, 'employee');
    const employeeToken2 = jwt.sign({ id: empInsert2.lastInsertRowid, role: 'employee' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    
    // Clock in first (inside)
    await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken2}`)
      .send({
        type: 'check_in',
        timestamp: new Date().toISOString(),
        lat: 37.7749,
        lng: -122.4194
      });
      
    // Clock out outside
    const res = await request(app)
      .post('/api/attendance/clock')
      .set('Authorization', `Bearer ${employeeToken2}`)
      .send({
        type: 'check_out',
        timestamp: new Date().toISOString(),
        lat: 38.0,
        lng: -122.0
      });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Away from job/);
  });

  it('should allow employee to fetch their own attendance logs', async () => {
    const res = await request(app)
      .get('/api/attendance/my-logs')
      .set('Authorization', `Bearer ${employeeToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('check_in');
  });
});
