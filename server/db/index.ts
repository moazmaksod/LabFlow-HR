import Database from 'better-sqlite3';
import * as path from 'path';
import { schema } from './schema.js';

// Connect to SQLite DB (file-based for persistence)
const dbPath = process.env.DB_PATH === ':memory:'
  ? ':memory:'
  : path.resolve(process.cwd(), process.env.DB_PATH || 'labflow.db');

const isTestEnv = process.env.NODE_ENV === 'test';


const isBenchmarkOrTest = isTestEnv || dbPath.includes('temp') || dbPath === ':memory:';

const db = new Database(dbPath, {
    verbose: isBenchmarkOrTest ? undefined : console.log
});

// Strictly enforce Foreign Keys
db.pragma('foreign_keys = ON');
// Use Write-Ahead Logging for better concurrent performance
db.pragma('journal_mode = WAL');

export function initDb() {
  try {
    if (!isTestEnv) {
      console.log('Initializing database schema...');
    }
    db.exec(schema);

    // Migration: Add new columns to jobs and profiles
    const jobColumns = db.prepare("PRAGMA table_info(jobs)").all() as any[];
    const profileColumns = db.prepare("PRAGMA table_info(profiles)").all() as any[];
    const attendanceColumns = db.prepare("PRAGMA table_info(attendance)").all() as any[];
    const requestColumns = db.prepare("PRAGMA table_info(requests)").all() as any[];
    const settingsColumns = db.prepare("PRAGMA table_info(settings)").all() as any[];

    // Shift instances migration: no specific data migration needed,
    // table and indexes created by db.exec(schema)

    // Settings migrations
    if (!settingsColumns.some(c => c.name === 'company_name')) {
      db.exec(`
        -- Backup current settings
        CREATE TABLE IF NOT EXISTS settings_backup AS SELECT * FROM settings;
        DROP TABLE settings;
      `);
      db.exec(schema);
    }
    
    // Add new settings columns if they don't exist
    if (!settingsColumns.some(c => c.name === 'company_favicon_url')) {
      db.exec("ALTER TABLE settings ADD COLUMN company_favicon_url TEXT;");
    }

    // Wi-Fi Validation migrations
    if (!settingsColumns.some(c => c.name === 'wifi_validation_toggle')) {
      db.exec("ALTER TABLE settings ADD COLUMN wifi_validation_toggle BOOLEAN NOT NULL DEFAULT 0;");
      db.exec("ALTER TABLE settings ADD COLUMN company_wifi_ssid TEXT;");
      db.exec("ALTER TABLE settings ADD COLUMN company_wifi_bssid TEXT;");
    }

    // Jobs migrations
    if (!jobColumns.some(c => c.name === 'required_hours_per_week')) {
      db.exec("ALTER TABLE jobs ADD COLUMN required_hours_per_week INTEGER;");
    }
    if (!jobColumns.some(c => c.name === 'default_annual_leave_days')) {
      db.exec("ALTER TABLE jobs ADD COLUMN default_annual_leave_days INTEGER DEFAULT 21;");
    }
    if (!jobColumns.some(c => c.name === 'default_sick_leave_days')) {
      db.exec("ALTER TABLE jobs ADD COLUMN default_sick_leave_days INTEGER DEFAULT 7;");
    }
    if (!jobColumns.some(c => c.name === 'allow_overtime')) {
      db.exec("ALTER TABLE jobs ADD COLUMN allow_overtime BOOLEAN DEFAULT 1;");
    }
    if (!jobColumns.some(c => c.name === 'employment_type')) {
      db.exec("ALTER TABLE jobs ADD COLUMN employment_type TEXT DEFAULT 'full-time';");
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
    if (!profileColumns.some(c => c.name === 'emergency_contact_relationship')) {
      db.exec("ALTER TABLE profiles ADD COLUMN emergency_contact_relationship TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'full_address')) {
      db.exec("ALTER TABLE profiles ADD COLUMN full_address TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'national_id')) {
      db.exec("ALTER TABLE profiles ADD COLUMN national_id TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'bank_name')) {
      db.exec("ALTER TABLE profiles ADD COLUMN bank_name TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'bank_account_iban')) {
      db.exec("ALTER TABLE profiles ADD COLUMN bank_account_iban TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'date_of_birth')) {
      db.exec("ALTER TABLE profiles ADD COLUMN date_of_birth DATE;");
    }
    if (!profileColumns.some(c => c.name === 'annual_leave_balance')) {
      db.exec("ALTER TABLE profiles ADD COLUMN annual_leave_balance REAL DEFAULT 21;");
    }
    if (!profileColumns.some(c => c.name === 'sick_leave_balance')) {
      db.exec("ALTER TABLE profiles ADD COLUMN sick_leave_balance REAL DEFAULT 7;");
    }
    if (!profileColumns.some(c => c.name === 'device_id')) {
      db.exec("ALTER TABLE profiles ADD COLUMN device_id TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'allow_overtime')) {
      db.exec("ALTER TABLE profiles ADD COLUMN allow_overtime BOOLEAN DEFAULT 0;");
    }
    if (!profileColumns.some(c => c.name === 'max_overtime_hours')) {
      db.exec("ALTER TABLE profiles ADD COLUMN max_overtime_hours REAL DEFAULT 0;");
    }
    if (!profileColumns.some(c => c.name === 'suspension_reason')) {
      db.exec("ALTER TABLE profiles ADD COLUMN suspension_reason TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'bio')) {
      db.exec("ALTER TABLE profiles ADD COLUMN bio TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'personal_phone')) {
      db.exec("ALTER TABLE profiles ADD COLUMN personal_phone TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'legal_name')) {
      db.exec("ALTER TABLE profiles ADD COLUMN legal_name TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'id_photo_url')) {
      db.exec("ALTER TABLE profiles ADD COLUMN id_photo_url TEXT;");
    }
    if (!profileColumns.some(c => c.name === 'hire_date')) {
      db.exec("ALTER TABLE profiles ADD COLUMN hire_date DATE;");
    }

    // Attendance migrations
    const attendanceSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance'").get() as any;
    if (attendanceSql && attendanceSql.sql.includes("'present'")) {
      if (!isTestEnv) {
        console.log('Migrating attendance table to new status constraints...');
      }
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;

        CREATE TABLE attendance_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            check_in DATETIME NOT NULL,
            check_out DATETIME,
            date DATE NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('on_time', 'late_in', 'early_out', 'absent', 'half_day', 'unscheduled')) DEFAULT 'on_time',
            current_status TEXT NOT NULL CHECK(current_status IN ('working', 'away')) DEFAULT 'working',
            location_lat REAL,
            location_lng REAL,
            approved_overtime_minutes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO attendance_new SELECT * FROM attendance;

        -- Update legacy statuses
        UPDATE attendance_new SET status = 'on_time' WHERE status = 'present';
        UPDATE attendance_new SET status = 'late_in' WHERE status = 'late';
        UPDATE attendance_new SET status = 'half_day' WHERE status = 'half-day';

        DROP TABLE attendance;
        ALTER TABLE attendance_new RENAME TO attendance;

        CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);

        CREATE TRIGGER IF NOT EXISTS update_attendance_updated_at AFTER UPDATE ON attendance
        FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
        BEGIN UPDATE attendance SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

        COMMIT;
        PRAGMA foreign_keys=on;
      `);
      if (!isTestEnv) {
        console.log('Attendance table migrated successfully.');
      }
    }

    const newAttendanceColumns = db.prepare("PRAGMA table_info(attendance)").all() as any[];
    if (!newAttendanceColumns.some(c => c.name === 'current_status')) {
      db.exec("ALTER TABLE attendance ADD COLUMN current_status TEXT NOT NULL DEFAULT 'working';");
    }
    if (!newAttendanceColumns.some(c => c.name === 'approved_overtime_minutes')) {
      db.exec("ALTER TABLE attendance ADD COLUMN approved_overtime_minutes INTEGER DEFAULT 0;");
    }

    // Requests migrations
    if (!requestColumns.some(c => c.name === 'type')) {
      db.exec("ALTER TABLE requests ADD COLUMN type TEXT;");
    }
    if (!requestColumns.some(c => c.name === 'reference_id')) {
      db.exec("ALTER TABLE requests ADD COLUMN reference_id INTEGER;");
    }
    if (!requestColumns.some(c => c.name === 'details')) {
      db.exec("ALTER TABLE requests ADD COLUMN details TEXT;");
    }
    if (!requestColumns.some(c => c.name === 'manager_note')) {
      db.exec("ALTER TABLE requests ADD COLUMN manager_note TEXT;");
    }
    if (!requestColumns.some(c => c.name === 'is_paid_permission')) {
      db.exec("ALTER TABLE requests ADD COLUMN is_paid_permission BOOLEAN DEFAULT 0;");
    }
    if (!requestColumns.some(c => c.name === 'paid_permission_minutes')) {
      db.exec("ALTER TABLE requests ADD COLUMN paid_permission_minutes INTEGER DEFAULT 0;");
    }

    const finalAttendanceColumns = db.prepare("PRAGMA table_info(attendance)").all() as any[];
    if (!finalAttendanceColumns.some(c => c.name === 'is_paid_permission')) {
      db.exec("ALTER TABLE attendance ADD COLUMN is_paid_permission BOOLEAN DEFAULT 0;");
    }
    if (!finalAttendanceColumns.some(c => c.name === 'paid_permission_minutes')) {
      db.exec("ALTER TABLE attendance ADD COLUMN paid_permission_minutes INTEGER DEFAULT 0;");
    }
    if (!finalAttendanceColumns.find(c => c.name === 'shift_id')) {
      db.exec("ALTER TABLE attendance ADD COLUMN shift_id TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_attendance_shift_id ON attendance(shift_id);");

    // Settings bootstrapping is done in schema default values.
    // We should ensure settings table has 1 row with these defaults.
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get() as any;
    if (settingsCount.count === 0) {
      db.prepare(`
        INSERT INTO settings (id, late_grace_period, geofence_radius, office_lat, office_lng)
        VALUES (1, ?, ?, ?, ?)
      `).run(
        process.env.DEFAULT_LATE_GRACE_PERIOD || 0,
        process.env.DEFAULT_GEOFENCE_RADIUS || 100,
        process.env.DEFAULT_GEOFENCE_LAT || 30.0444,
        process.env.DEFAULT_GEOFENCE_LNG || 31.2357
      );
    }

    if (!isTestEnv) {
      console.log('Database schema initialized successfully.');
    }
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

export default db;
