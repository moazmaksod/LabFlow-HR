import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('\n--- PLAYWRIGHT GLOBAL TEARDOWN: Cleaning Up Isolated Test Database ---');
  
  const testDbFiles = ['labflow_test.db', 'labflow_test.db-wal', 'labflow_test.db-shm'];
  for (const file of testDbFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`Successfully deleted test DB file: ${file}`);
      } catch (err) {
        console.warn(`Could not clean up test DB file ${file}:`, err);
      }
    }
  }
  
  console.log('--- PLAYWRIGHT GLOBAL TEARDOWN COMPLETE ---\n');
}

export default globalTeardown;
