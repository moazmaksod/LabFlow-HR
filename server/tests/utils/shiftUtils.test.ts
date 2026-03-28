import { getLogicalShiftDetails } from '../../utils/shiftUtils.js';

/**
 * @scenario Unit tests for logical shift gap detection and boundary calculations.
 * @expectedLogic
 *   - Given a timestamp and schedule, calculates the nearest logical shift.
 *   - Interprets gap bounds to classify early or late entries.
 * @edgeCases
 *   - Handling undefined/null schedules, and cross-day (night shift) boundaries reliably.
 */
describe('getLogicalShiftDetails', () => {
    const timestamp = '2023-10-25T08:00:00Z'; // This is a Wednesday, 8 AM UTC
    const timezone = 'UTC';

    it('should return nulls when schedule is null', () => {
        const result = getLogicalShiftDetails(null, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
        expect(result.logicalDate).toBe('2023-10-25');
    });

    it('should return nulls when schedule is undefined', () => {
        const result = getLogicalShiftDetails(undefined, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
        expect(result.logicalDate).toBe('2023-10-25');
    });

    it('should return nulls when schedule is an empty object', () => {
        const result = getLogicalShiftDetails({}, timestamp, timezone, 'check_in');
        expect(result.shift).toBeNull();
        expect(result.scheduledTime).toBeNull();
        expect(result.logicalDate).toBe('2023-10-25');
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
    
    it('should handle timezone specific shifts (NY Time)', () => {
        const schedule = {
            wednesday: [
                { start: '17:00', end: '05:00' } // 5 PM to 5 AM Thursday NY Time
            ]
        };
        // 2023-10-25T21:15:00Z هي الساعة 5:15 مساءً في نيويورك
        const punchIn = '2023-10-25T21:15:00Z'; 
        const result = getLogicalShiftDetails(schedule, punchIn, 'America/New_York', 'check_in');
        
        expect(result.shift).toEqual({ start: '17:00', end: '05:00' });
        expect(result.logicalDate).toBe('2023-10-25');
    });

    it('should correctly calculate end time in NY Timezone', () => {
        const schedule = { wednesday: [{ start: '17:00', end: '05:00' }] };
        // 2023-10-26T09:00:00Z هي الساعة 5:00 صباح الخميس في نيويورك
        const punchOut = '2023-10-26T09:00:00Z';
        const checkInTime = '2023-10-25T21:15:00Z';

        const result = getLogicalShiftDetails(schedule, punchOut, 'America/New_York', 'check_out', checkInTime);
        
        expect(result.shift).toEqual({ start: '17:00', end: '05:00' });
        expect(result.logicalDate).toBe('2023-10-25');
    });

});
