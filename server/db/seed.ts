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
      
      insert.run('System Admin', 'admin@labflow.com', passwordHash, 'manager');
      console.log('Default manager account created: admin@labflow.com / password123');
    } else {
      console.log('Database already seeded. Skipping seed process.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};
