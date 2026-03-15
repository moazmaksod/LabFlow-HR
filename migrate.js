import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || 'labflow.db');
const db = new Database(dbPath, { verbose: console.log });

db.pragma('foreign_keys = OFF');

db.transaction(() => {
    // Migrate attendance
    db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            check_in DATETIME NOT NULL,
            check_out DATETIME,
            date DATE NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('present', 'late', 'absent', 'half-day', 'late_in', 'on_time')) DEFAULT 'present',
            current_status TEXT NOT NULL CHECK(current_status IN ('working', 'away')) DEFAULT 'working',
            location_lat REAL,
            location_lng REAL,
            approved_overtime_minutes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        INSERT INTO attendance_new (id, user_id, check_in, check_out, date, status, current_status, location_lat, location_lng, approved_overtime_minutes, created_at, updated_at)
        SELECT id, user_id, check_in, check_out, date, status, current_status, location_lat, location_lng, approved_overtime_minutes, created_at, updated_at
        FROM attendance;
    `);

    db.exec(`DROP TABLE attendance;`);
    db.exec(`ALTER TABLE attendance_new RENAME TO attendance;`);

    // Migrate requests
    db.exec(`
        CREATE TABLE IF NOT EXISTS requests_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            attendance_id INTEGER,
            requested_check_in DATETIME,
            requested_check_out DATETIME,
            type TEXT,
            reference_id INTEGER,
            reason TEXT NOT NULL,
            details TEXT,
            manager_note TEXT,
            status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL
        );
    `);

    db.exec(`
        INSERT INTO requests_new (id, user_id, attendance_id, requested_check_in, requested_check_out, type, reference_id, reason, details, manager_note, status, created_at, updated_at)
        SELECT id, user_id, attendance_id, requested_check_in, requested_check_out, type, reference_id, reason, details, manager_note, status, created_at, updated_at
        FROM requests;
    `);

    db.exec(`DROP TABLE requests;`);
    db.exec(`ALTER TABLE requests_new RENAME TO requests;`);

    // Recreate indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_attendance_id ON requests(attendance_id);`);

    // Recreate triggers
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_attendance_updated_at AFTER UPDATE ON attendance
        FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
        BEGIN UPDATE attendance SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
    `);
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_requests_updated_at AFTER UPDATE ON requests
        FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
        BEGIN UPDATE requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
    `);

})();

db.pragma('foreign_keys = ON');
console.log('Migration complete');
