import Database from 'better-sqlite3';
import { schema } from './server/db/schema.js';

try {
  const db = new Database(':memory:');
  db.exec(schema);
  console.log('Schema is valid');
} catch (e) {
  console.error(e);
}
