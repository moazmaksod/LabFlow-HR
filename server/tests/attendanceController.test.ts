import { getClosestShift } from '../controllers/attendanceController.js';

describe('getClosestShift', () => {
    const timestamp = '2023-10-25T08:00:00Z'; // This is a Wednesday

    it('should return nulls when schedule is null', () => {
        const result = getClosestShift(null, timestamp, 'start');
        expect(result).toEqual({ shift: null, scheduledTime: null });
    });

    it('should return nulls when schedule is undefined', () => {
        const result = getClosestShift(undefined, timestamp, 'start');
        expect(result).toEqual({ shift: null, scheduledTime: null });
    });

    it('should return nulls when schedule is an empty object', () => {
        const result = getClosestShift({}, timestamp, 'start');
        expect(result).toEqual({ shift: null, scheduledTime: null });
    });

    it('should find the closest start shift on the same day', () => {
        const schedule = {
            wednesday: [
                { start: '09:00', end: '17:00' }
            ]
        };
        // 2023-10-25 is Wednesday.
        const result = getClosestShift(schedule, timestamp, 'start');
        expect(result.shift).toEqual({ start: '09:00', end: '17:00' });
        expect(result.scheduledTime?.getHours()).toBe(9);
    });

    it('should find the closest end shift', () => {
        const schedule = {
            wednesday: [
                { start: '09:00', end: '17:00' }
            ]
        };
        const result = getClosestShift(schedule, '2023-10-25T17:30:00Z', 'end');
        expect(result.shift).toEqual({ start: '09:00', end: '17:00' });
        expect(result.scheduledTime?.getHours()).toBe(17);
    });

    it('should handle shifts that cross midnight for end time', () => {
        const schedule = {
            wednesday: [
                { start: '22:00', end: '06:00' } // crosses midnight to Thursday
            ]
        };
        const punchTime = '2023-10-26T06:15:00Z'; // Thursday early morning
        // The reference date is Thursday. The function checks Wed, Thu, Fri.
        // On Wed, it sees start 22:00, end 06:00. End time is before start time, so it adds 1 day.
        // It should match the 06:00 on Thursday from Wednesday's schedule.
        const result = getClosestShift(schedule, punchTime, 'end');
        expect(result.shift).toEqual({ start: '22:00', end: '06:00' });
        expect(result.scheduledTime?.getDate()).toBe(26); // Thursday
        expect(result.scheduledTime?.getHours()).toBe(6);
    });
});
