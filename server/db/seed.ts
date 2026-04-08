import bcrypt from 'bcryptjs';
import db from './index.js';

export const seedDb = async (): Promise<void> => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

    if (row.count === 0) {
      console.log('Users table is empty. Seeding default manager account from ENV...');

      const adminName = process.env.ADMIN_NAME || 'Super Admin';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@labflow.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'securepassword123';

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPassword, salt);

      const insert = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);

      const info = insert.run(adminName, adminEmail, passwordHash, 'manager');
      const userId = info.lastInsertRowid;

      // Create profile for the admin
      db.prepare(`
        INSERT INTO profiles (user_id, status)
        VALUES (?, 'active')
      `).run(userId);

      console.log(`Default manager account created: ${adminEmail} / [HIDDEN]`);
    } else {
      console.log('Database already seeded. Skipping seed process.');
    }

    // Settings seeding is primarily handled in index.ts migrations now, but we can ensure it's fully populated here if needed.
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};
