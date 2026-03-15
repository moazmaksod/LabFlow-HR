import { getLogicalShiftDetails } from '../utils/shiftUtils.js';

describe('getLogicalShiftDetails', () => {
    const timestamp = '2023-10-25T08:00:00Z'; // This is a Wednesday, 8 AM UTC
    const timezone = 'UTC';

    it('should return nulls when schedule is null', () => {
        const result = getLogicalShiftDetails(null, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
    });

    it('should return nulls when schedule is undefined', () => {
        const result = getLogicalShiftDetails(undefined, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
    });

    it('should return nulls when schedule is an empty object', () => {
        const result = getLogicalShiftDetails({}, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
    });

    it('should find the shift when punching in early', () => {
        const schedule = {
            wednesday: [
                { start: '09:00', end: '17:00' }
            ]
        };
        const result = getLogicalShiftDetails(schedule, timestamp, timezone, 'check_in');
        expect(result.shift).toEqual({ start: '09:00', end: '17:00' });
        expect(result.scheduledTime?.getUTCHours()).toBe(9);
    });

    it('should find the active shift when punching out', () => {
        const schedule = {
            wednesday: [
                { start: '09:00', end: '17:00' }
            ]
        };
        const result = getLogicalShiftDetails(schedule, '2023-10-25T17:30:00Z', timezone, 'check_out');
        expect(result.shift).toEqual({ start: '09:00', end: '17:00' });
        expect(result.scheduledTime?.getUTCHours()).toBe(17);
    });

    it('should handle shifts that cross midnight for end time', () => {
        const schedule = {
            wednesday: [
                { start: '22:00', end: '06:00' } // crosses midnight to Thursday
            ]
        };
        const punchTime = '2023-10-26T06:15:00Z'; // Thursday early morning (6:15 AM)
        const checkInTime = '2023-10-25T21:50:00Z'; // Wednesday 9:50 PM

        const result = getLogicalShiftDetails(schedule, punchTime, timezone, 'check_out', checkInTime);
        expect(result.shift).toEqual({ start: '22:00', end: '06:00' });
        expect(result.scheduledTime?.getUTCDate()).toBe(26); // Thursday
        expect(result.scheduledTime?.getUTCHours()).toBe(6);
        expect(result.logicalDate).toBe('2023-10-25');
    });
});
