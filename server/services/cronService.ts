import cron from 'node-cron';
import logger from '../utils/logger.js';
import { generateDailyAttendance } from './dailyAttendanceService.js';

export const initCronJobs = () => {
    // Run every day at 00:05 AM to process the previous day
    cron.schedule('5 0 * * *', () => {
        logger.info('Running Daily Attendance Cron Job');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const targetDate = yesterday.toISOString().split('T')[0];
        
        generateDailyAttendance(targetDate);
    });
    logger.info('Cron jobs initialized');
};
