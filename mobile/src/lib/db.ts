import * as SQLite from 'expo-sqlite';

// Open or create the database
const db = SQLite.openDatabaseSync('labflow_offline.db');

// Initialize the local logs table
export const initLocalDb = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS local_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      payload TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);
};

// Save an offline log
export const saveOfflineLog = (type: 'check_in' | 'check_out', timestamp: string, lat: number, lng: number, deviceId: string) => {
  db.runSync(
    'INSERT INTO local_logs (type, timestamp, lat, lng, deviceId, synced) VALUES (?, ?, ?, ?, ?, 0)',
    [type, timestamp, lat, lng, deviceId]
  );
};

// Get all unsynced logs
export const getUnsyncedLogs = () => {
  return db.getAllSync('SELECT * FROM local_logs WHERE synced = 0');
};

// Save an offline request
export const saveOfflineRequest = (method: string, endpoint: string, payload: any) => {
  db.runSync(
    'INSERT INTO local_requests (method, endpoint, payload, synced) VALUES (?, ?, ?, 0)',
    [method, endpoint, JSON.stringify(payload)]
  );
};

// Get all unsynced requests
export const getUnsyncedRequests = () => {
  return db.getAllSync('SELECT * FROM local_requests WHERE synced = 0');
};

// Mark requests as synced
export const markRequestsAsSynced = (ids: number[]) => {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE local_requests SET synced = 1 WHERE id IN (${placeholders})`, ids);
};

// Mark logs as synced
export const markLogsAsSynced = (ids: number[]) => {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE local_logs SET synced = 1 WHERE id IN (${placeholders})`, ids);
};

// Clear synced logs to save space (optional)
export const clearSyncedLogs = () => {
  db.runSync('DELETE FROM local_logs WHERE synced = 1');
  db.runSync('DELETE FROM local_requests WHERE synced = 1');
};
