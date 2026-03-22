import bcrypt from 'bcryptjs';
import db from './index.js';

export const seedDb = async (): Promise<void> => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    
    if (row.count === 0) {
      console.log('Users table is empty. Seeding default manager account...');
      
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);
      
      const insert = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      
      const info = insert.run('System Admin', 'admin@labflow.com', passwordHash, 'manager');
      const userId = info.lastInsertRowid;
      
      // Create profile for the admin
      db.prepare(`
        INSERT INTO profiles (user_id, status)
        VALUES (?, 'active')
      `).run(userId);

      console.log('Default manager account created: admin@labflow.com / password123');
    } else {
      console.log('Database already seeded. Skipping seed process.');
    }

    // Seed default settings if empty
    const settingsRow = db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
    if (settingsRow.count === 0) {
      console.log('Settings table is empty. Seeding default settings...');
      const insertSettings = db.prepare(`
        INSERT INTO settings (
          id, company_name, company_logo_url, brand_primary_color, company_timezone, support_contact,
          payroll_cycle_type, custom_payroll_cycle_days, overtime_rate_percent, weekend_rate_percent, attendance_bonus_amount, show_salary_estimate,
          geofence_toggle, office_lat, office_lng, geofence_radius, time_sync_interval, max_drift_threshold, accuracy_meters, device_binding_enforced,
          auto_checkout, step_away_grace_period, late_grace_period, max_monthly_permissions, enable_reminders, send_daily_report, maintenance_mode
        )
        VALUES (
          1, 'LabFlow', NULL, '#4f46e5', 'UTC', NULL,
          'calendar_month', 0, 150.0, 200.0, 0.0, 1,
          1, 37.7749, -122.4194, 50, 300, 10, 100, 1,
          0, 5, 15, 3, 1, 0, 0
        )
      `);
      insertSettings.run();
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};
