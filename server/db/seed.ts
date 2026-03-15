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
        INSERT INTO settings (id, office_lat, office_lng, radius_meters, timezone)
        VALUES (1, 37.7749, -122.4194, 50, 'UTC')
      `);
      insertSettings.run();
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};
