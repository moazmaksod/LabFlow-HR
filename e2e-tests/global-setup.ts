import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup(config: FullConfig) {
  console.log('\n--- PLAYWRIGHT GLOBAL SETUP: Seeding Isolated Test Database ---');
  
  // Ensure DB_PATH is set
  process.env.DB_PATH = 'labflow_test.db';
  
  // Clean any residual test DB files first to ensure fresh seed
  const testDbFiles = ['labflow_test.db', 'labflow_test.db-wal', 'labflow_test.db-shm'];
  for (const file of testDbFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`Deleted stale test DB file: ${file}`);
      } catch (err) {
        console.warn(`Could not delete stale test DB file ${file}:`, err);
      }
    }
  }

  // Populate the test database with test data
  try {
    console.log('Running test data population...');
    execSync('npx tsx server/db/populateTestData.ts', {
      env: { ...process.env, DB_PATH: 'labflow_test.db', NODE_ENV: 'test' },
      stdio: 'inherit',
    });
    console.log('Test database seeded successfully.');
  } catch (error) {
    console.error('Failed to seed test database:', error);
    throw error;
  }
  
  console.log('--- PLAYWRIGHT GLOBAL SETUP COMPLETE ---\n');
}

export default globalSetup;
