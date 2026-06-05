import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;
let employeeToken: string;

beforeAll(async () => {
  initDb();
  
  // Seed settings
  db.prepare(`UPDATE settings SET office_lat = 37.7749, office_lng = -122.4194, geofence_radius = 50 WHERE id = 1`).run();

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

/**
 * @scenario Validates the retrieval and updating of global system settings (e.g., office location, timezone).
 * @expectedLogic
 *   - Authenticated users can fetch global settings.
 *   - Only Managers can update system configurations like geofence radius.
 * @edgeCases
 *   - Employees attempting unauthorized updates should face strict 403 blocks.
 */
describe('Settings API', () => {
  it('should allow authenticated users to get settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('office_lat', 37.7749);
    expect(res.body).toHaveProperty('office_lng', -122.4194);
    expect(res.body).toHaveProperty('geofence_radius', 50);
  });

  it('should allow manager to update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ office_lat: 40.7128, office_lng: -74.0060, geofence_radius: 100 });
    
    expect(res.status).toBe(200);
    expect(res.body.office_lat).toBe(40.7128);
    expect(res.body.office_lng).toBe(-74.0060);
    expect(res.body.geofence_radius).toBe(100);
  });

  it('should deny employee from updating settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ office_lat: 51.5074, office_lng: -0.1278, geofence_radius: 200 });
    
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions');
  });

  it('should handle maintenance mode activation and force logout non-managers', async () => {
    // 1. Enable Maintenance Mode as Manager
    let res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ maintenance_mode: 1 });
    expect(res.status).toBe(200);
    expect(res.body.maintenance_mode).toBe(1);

    // 2. Try to fetch settings as Employee - should get 401 with the exact maintenance error message
    res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('System Offline: The platform is currently undergoing scheduled maintenance. Please try again later.');

    // 3. Manager should still be able to query settings
    res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.maintenance_mode).toBe(1);

    // 4. Disable Maintenance Mode as Manager
    res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ maintenance_mode: 0 });
    expect(res.status).toBe(200);
    expect(res.body.maintenance_mode).toBe(0);

    // 5. Employee should now be able to fetch settings again
    res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.maintenance_mode).toBe(0);
  });
});
