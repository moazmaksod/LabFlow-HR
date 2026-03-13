export const schema = `
-- Enable Foreign Keys
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('manager', 'employee', 'pending')) DEFAULT 'pending',
    biometric_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    hourly_rate REAL NOT NULL,
    required_hours REAL NOT NULL,
    required_hours_per_week INTEGER,
    preferred_gender TEXT, -- 'male', 'female', 'any'
    min_age INTEGER,
    max_age INTEGER,
    grace_period INTEGER NOT NULL DEFAULT 15, -- In minutes
    weekly_schedule TEXT, -- JSON stringified schedule array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    job_id INTEGER,
    profile_picture_url TEXT,
    age INTEGER,
    gender TEXT,
    weekly_schedule TEXT, -- JSON stringified schedule array
    hourly_rate INTEGER DEFAULT 0,
    lunch_break_minutes INTEGER DEFAULT 0,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    leave_balance INTEGER DEFAULT 21,
    device_id TEXT,
    allow_overtime BOOLEAN DEFAULT 0,
    max_overtime_hours REAL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'suspended')) DEFAULT 'inactive',
    suspension_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in DATETIME NOT NULL,
    check_out DATETIME,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('on_time', 'late_in', 'early_out', 'absent', 'half_day')) DEFAULT 'on_time',
    current_status TEXT NOT NULL CHECK(current_status IN ('working', 'away')) DEFAULT 'working',
    location_lat REAL,
    location_lng REAL,
    approved_overtime_minutes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    attendance_id INTEGER,
    requested_check_in DATETIME,
    requested_check_out DATETIME,
    type TEXT, -- 'manual_clock', 'permission_to_leave', 'overtime_approval', 'early_leave_approval', 'attendance_correction'
    reference_id INTEGER, -- points to shift_interruptions.id if type is 'permission_to_leave'
    reason TEXT NOT NULL,
    details TEXT,
    manager_note TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shift_interruptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    type TEXT NOT NULL DEFAULT 'step_away',
    status TEXT NOT NULL CHECK(status IN ('auto_approved', 'pending_manager', 'manager_approved', 'manager_rejected')) DEFAULT 'auto_approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bonus', 'deduction', 'alert', 'info')),
    read_status BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one row exists
    office_lat REAL NOT NULL,
    office_lng REAL NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 50,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes for Foreign Keys
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_job_id ON profiles(job_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_attendance_id ON requests(attendance_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_interruptions_attendance_id ON shift_interruptions(attendance_id);

-- Triggers for updated_at (with safety condition to prevent infinite loops)
CREATE TRIGGER IF NOT EXISTS update_users_updated_at AFTER UPDATE ON users
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_jobs_updated_at AFTER UPDATE ON jobs
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_profiles_updated_at AFTER UPDATE ON profiles
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_attendance_updated_at AFTER UPDATE ON attendance
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE attendance SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_requests_updated_at AFTER UPDATE ON requests
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_shift_interruptions_updated_at AFTER UPDATE ON shift_interruptions
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE shift_interruptions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_notifications_updated_at AFTER UPDATE ON notifications
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE notifications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_settings_updated_at AFTER UPDATE ON settings
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
`;
