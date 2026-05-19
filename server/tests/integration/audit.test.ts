import request from 'supertest';
import app from '../../app.js';
import db, { initDb } from '../../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

let managerToken: string;

beforeAll(async () => {
  initDb();

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);

  // Create manager
  const managerInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Manager Audit', 'manager_audit@test.com', hash, 'manager');
  managerToken = jwt.sign({ id: managerInsert.lastInsertRowid, role: 'manager' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

  // Create some audit logs
  const insertLog = db.prepare(`
    INSERT INTO audit_logs (entity_name, entity_id, action, actor_id, old_values, new_values)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertLog.run('User', 1, 'UPDATE', managerInsert.lastInsertRowid, JSON.stringify({ name: 'Old' }), JSON.stringify({ name: 'New' }));
  insertLog.run('User', 2, 'CREATE', managerInsert.lastInsertRowid, null, JSON.stringify({ name: 'Created' }));
});

afterAll(() => {
  db.close();
});

describe('Audit API', () => {
  it('should allow manager to fetch audit logs with parsed JSON', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const logWithOld = res.body.find((l: any) => l.old_values !== null);
    expect(typeof logWithOld.old_values).toBe('object');
    expect(logWithOld.old_values.name).toBe('Old');
    expect(typeof logWithOld.new_values).toBe('object');
    expect(logWithOld.new_values.name).toBe('New');

    const logWithoutOld = res.body.find((l: any) => l.old_values === null);
    expect(logWithoutOld.old_values).toBeNull();
    expect(typeof logWithoutOld.new_values).toBe('object');
    expect(logWithoutOld.new_values.name).toBe('Created');
  });

  it('should deny non-managers from fetching audit logs', async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('password123', salt);
    const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Employee Audit', 'emp_audit@test.com', hash, 'employee');
    const employeeToken = jwt.sign({ id: empInsert.lastInsertRowid, role: 'employee' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});
