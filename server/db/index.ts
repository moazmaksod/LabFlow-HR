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
    
    // Migration: Add new columns to jobs and profiles
    const jobColumns = db.prepare("PRAGMA table_info(jobs)").all() as any[];
    const profileColumns = db.prepare("PRAGMA table_info(profiles)").all() as any[];
    const attendanceColumns = db.prepare("PRAGMA table_info(attendance)").all() as any[];
    const requestColumns = db.prepare("PRAGMA table_info(requests)").all() as any[];

    // Jobs migrations
    if (!jobColumns.some(c => c.name === 'required_hours_per_week')) {
      db.exec("ALTER TABLE jobs ADD COLUMN required_hours_per_week INTEGER;");
    }
    if (!jobColumns.some(c => c.name === 'preferred_gender')) {
      db.exec("ALTER TABLE jobs ADD COLUMN preferred_gender TEXT;");
    }
    if (!jobColumns.some(c => c.name === 'min_age')) {
      db.exec("ALTER TABLE jobs ADD COLUMN min_age INTEGER;");
    }
    if (!jobColumns.some(c => c.name === 'max_age')) {
      db.exec("ALTER TABLE jobs ADD COLUMN max_age INTEGER;");
    }

    // Profiles migrations
    if (!profileColumns.some(c => c.name === 'weekly_schedule')) {
      db.exec("ALTER TABLE profiles ADD COLUMN weekly_schedule TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'hourly_rate')) {
      db.exec("ALTER TABLE profiles ADD COLUMN hourly_rate INTEGER DEFAULT 0;");
    }
    if (!profileColumns.some(c => c.name === 'lunch_break_minutes')) {
      db.exec("ALTER TABLE profiles ADD COLUMN lunch_break_minutes INTEGER DEFAULT 0;");
    }
    if (!profileColumns.some(c => c.name === 'emergency_contact_name')) {
      db.exec("ALTER TABLE profiles ADD COLUMN emergency_contact_name TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'emergency_contact_phone')) {
      db.exec("ALTER TABLE profiles ADD COLUMN emergency_contact_phone TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'leave_balance')) {
      db.exec("ALTER TABLE profiles ADD COLUMN leave_balance INTEGER DEFAULT 21;");
    }

    // Attendance migrations
    if (!attendanceColumns.some(c => c.name === 'current_status')) {
      db.exec("ALTER TABLE attendance ADD COLUMN current_status TEXT NOT NULL DEFAULT 'working';");
    }

    // Requests migrations
    if (!requestColumns.some(c => c.name === 'type')) {
      db.exec("ALTER TABLE requests ADD COLUMN type TEXT;");
    }
    if (!requestColumns.some(c => c.name === 'reference_id')) {
      db.exec("ALTER TABLE requests ADD COLUMN reference_id INTEGER;");
    }

    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

export default db;
