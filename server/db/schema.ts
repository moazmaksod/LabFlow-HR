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
    grace_period INTEGER NOT NULL DEFAULT 15, -- In minutes
    default_annual_leave_days INTEGER DEFAULT 21,
    default_sick_leave_days INTEGER DEFAULT 7,
    allow_overtime BOOLEAN DEFAULT 1,
    employment_type TEXT DEFAULT 'full-time',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    job_id INTEGER,
    profile_picture_url TEXT,
    date_of_birth DATE,
    gender TEXT,
    weekly_schedule TEXT, -- JSON stringified schedule array
    hourly_rate INTEGER DEFAULT 0,
    lunch_break_minutes INTEGER DEFAULT 0,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    full_address TEXT,
    national_id TEXT,
    bank_name TEXT,
    bank_account_iban TEXT,
    bio TEXT,
    personal_phone TEXT,
    legal_name TEXT,
    id_photo_url TEXT,
    hire_date DATE,
    annual_leave_balance REAL DEFAULT 21,
    sick_leave_balance REAL DEFAULT 7,
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
    status TEXT NOT NULL CHECK(status IN ('on_time', 'late_in', 'early_out', 'absent', 'half_day', 'unscheduled')) DEFAULT 'on_time',
    current_status TEXT NOT NULL CHECK(current_status IN ('working', 'away')) DEFAULT 'working',
    location_lat REAL,
    location_lng REAL,
    approved_overtime_minutes INTEGER DEFAULT 0,
    is_paid_permission BOOLEAN DEFAULT 0,
    paid_permission_minutes INTEGER DEFAULT 0,
    shift_id TEXT,
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
    is_paid_permission BOOLEAN DEFAULT 0,
    paid_permission_minutes INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'canceled')) DEFAULT 'pending',
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

    -- Identity
    company_name TEXT NOT NULL DEFAULT 'LabFlow',
    company_logo_url TEXT,
    brand_primary_color TEXT NOT NULL DEFAULT '#4f46e5',
    company_timezone TEXT NOT NULL DEFAULT 'UTC',
    support_contact TEXT,

    -- Payroll
    payroll_cycle_type TEXT NOT NULL DEFAULT 'calendar_month',
    custom_payroll_cycle_days INTEGER NOT NULL DEFAULT 0,
    overtime_rate_percent REAL NOT NULL DEFAULT 150.0,
    weekend_rate_percent REAL NOT NULL DEFAULT 200.0,
    attendance_bonus_amount REAL NOT NULL DEFAULT 0.0,
    show_salary_estimate BOOLEAN NOT NULL DEFAULT 1,

    -- Security
    geofence_toggle BOOLEAN NOT NULL DEFAULT 1,
    office_lat REAL NOT NULL DEFAULT 0,
    office_lng REAL NOT NULL DEFAULT 0,
    geofence_radius REAL NOT NULL DEFAULT 50,
    time_sync_interval INTEGER NOT NULL DEFAULT 300, -- seconds
    max_drift_threshold INTEGER NOT NULL DEFAULT 10, -- seconds
    accuracy_meters INTEGER NOT NULL DEFAULT 100,
    device_binding_enforced BOOLEAN NOT NULL DEFAULT 1,

    -- Policy
    auto_checkout BOOLEAN NOT NULL DEFAULT 0,
    step_away_grace_period INTEGER NOT NULL DEFAULT 5,
    late_grace_period INTEGER NOT NULL DEFAULT 15,
    max_monthly_permissions INTEGER NOT NULL DEFAULT 3,
    enable_reminders BOOLEAN NOT NULL DEFAULT 1,
    send_daily_report BOOLEAN NOT NULL DEFAULT 0,
    maintenance_mode BOOLEAN NOT NULL DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payrolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    base_salary REAL NOT NULL DEFAULT 0,
    total_additions REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    net_salary REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('draft', 'finalized', 'paid')) DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_id INTEGER NOT NULL,
    reference_id INTEGER, -- Can be attendance_id or request_id
    type TEXT NOT NULL, -- 'overtime', 'late_deduction', 'step_away_unpaid', 'bonus', 'deduction'
    hours REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('applied', 'rejected', 'voided')) DEFAULT 'applied',
    manager_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_id) REFERENCES payrolls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER, -- NULL means 'System'
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance Indexes for Foreign Keys
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_job_id ON profiles(job_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_attendance_id ON requests(attendance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_shift_id ON attendance(shift_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_interruptions_attendance_id ON shift_interruptions(attendance_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id);

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

CREATE TRIGGER IF NOT EXISTS update_payrolls_updated_at AFTER UPDATE ON payrolls
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE payrolls SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_payroll_transactions_updated_at AFTER UPDATE ON payroll_transactions
FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN UPDATE payroll_transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
`;