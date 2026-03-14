import request from 'supertest';
import app from '../app.js';
import db, { initDb } from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;
let employeeToken: string;

beforeAll(async () => {
  initDb();
  
  // Seed settings
  db.prepare(`INSERT INTO settings (id, office_lat, office_lng, radius_meters) VALUES (1, 37.7749, -122.4194, 50)`).run();

  // Create manager
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager', 'manager_settings@test.com', hash, 'manager');
  managerToken = jwt.sign({ id: managerInsert.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

  // Create employee
  const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee', 'employee_settings@test.com', hash, 'employee');
  employeeToken = jwt.sign({ id: empInsert.lastInsertRowid, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
});

afterAll(() => {
  db.close();
});

describe('Settings API', () => {
  it('should allow authenticated users to get settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('office_lat', 37.7749);
    expect(res.body).toHaveProperty('office_lng', -122.4194);
    expect(res.body).toHaveProperty('radius_meters', 50);
  });

  it('should allow manager to update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ office_lat: 40.7128, office_lng: -74.0060, radius_meters: 100 });
    
    expect(res.status).toBe(200);
    expect(res.body.office_lat).toBe(40.7128);
    expect(res.body.office_lng).toBe(-74.0060);
    expect(res.body.radius_meters).toBe(100);
  });

  it('should deny employee from updating settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ office_lat: 51.5074, office_lng: -0.1278, radius_meters: 200 });
    
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });
});
