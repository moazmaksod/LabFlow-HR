import Database from 'better-sqlite3';
import * as path from 'path';
import { schema } from './schema.js';

// Connect to SQLite DB (file-based for persistence)
const dbPath = process.env.DB_PATH === ':memory:' 
  ? ':memory:' 
  : path.resolve(process.cwd(), process.env.DB_PATH || 'labflow.db');
const db = new Database(dbPath, { verbose: console.log });

// Strictly enforce Foreign Keys
db.pragma('foreign_keys = ON');
// Use Write-Ahead Logging for better concurrent performance
db.pragma('journal_mode = WAL');

export function initDb() {
  try {
    console.log('Initializing database schema...');
    db.exec(schema);
    
    // Migration: Add age and gender to profiles if they don't exist
    const columns = db.prepare("PRAGMA table_info(profiles)").all() as any[];
    const hasAge = columns.some(c => c.name === 'age');
    const hasGender = columns.some(c => c.name === 'gender');
    
    if (!hasAge) {
      db.exec("ALTER TABLE profiles ADD COLUMN age INTEGER;");
      console.log('Added age column to profiles table.');
    }
    if (!hasGender) {
      db.exec("ALTER TABLE profiles ADD COLUMN gender TEXT;");
      console.log('Added gender column to profiles table.');
    }

    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

export default db;
