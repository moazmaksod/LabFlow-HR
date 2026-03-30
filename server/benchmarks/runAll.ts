import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * LabFlow-HR Portable Benchmark Runner (ESM Compatible)
 * This script detects and runs all peer benchmark files in the same directory.
 */

// Load environment variables from .env
dotenv.config();

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRENT_DIR = __dirname;
const TEMP_DB_PATH = path.join(CURRENT_DIR, 'benchmark_temp.db');

async function runBenchmarks() {
    console.log('🚀 Starting LabFlow-HR Performance Suite');
    
    // Set the temporary database path in environment
    process.env.DB_PATH = TEMP_DB_PATH;
    console.log(`📂 Working Directory: ${CURRENT_DIR}`);
    console.log(`📂 Using Temporary DB: ${TEMP_DB_PATH}\n`);

    // Scan for other TypeScript files in this directory, excluding this runner
    const files = fs.readdirSync(CURRENT_DIR)
        .filter(f => f.endsWith('.ts') && f !== 'runAll.ts');

    if (files.length === 0) {
        console.log('❌ No benchmark files found in this directory.');
        return;
    }

    try {
        for (const file of files) {
            const filePath = path.join(CURRENT_DIR, file);
            console.log(`\n🚀 [Executing: ${file}]`);
            
            /**
             * Execute the peer benchmark file using ts-node.
             * env: { ...process.env } ensures the child process receives the TEMP_DB_PATH override.
             */
            execSync(`npx tsx "${filePath}"`, {
                stdio: 'inherit',
                env: { ...process.env } // This passes DB_PATH=benchmark_temp.db to the child
            });
        }
    } catch (error) {
        console.error(`\n❌ Error: One or more benchmarks failed to execute.`);
    } finally {
        // Cleanup phase: Delete the temporary database and its journal files
        console.log('\n🧹 Cleaning up temporary benchmark files...');
        const cleanupTargets = [TEMP_DB_PATH, `${TEMP_DB_PATH}-wal`, `${TEMP_DB_PATH}-shm`];
        
        cleanupTargets.forEach(target => {
            if (fs.existsSync(target)) {
                try {
                    fs.unlinkSync(target);
                } catch (e) {
                    // Silently ignore cleanup errors if file is locked or already gone
                }
            }
        });
        console.log('✅ Performance suite execution finished.');
    }
}

// Start the execution
runBenchmarks();