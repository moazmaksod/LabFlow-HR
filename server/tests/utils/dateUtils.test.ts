import { getDateStringInTimezone } from '../../utils/timeManager.js';

describe('dateUtils - getDateStringInTimezone', () => {
    const timestamp = '2023-10-25T12:00:00Z'; // UTC date

    it('should format date correctly for a valid timezone (America/New_York)', () => {
        const result = getDateStringInTimezone(timestamp, 'America/New_York');
        expect(result).toBe('2023-10-25');
    });

    it('should format date correctly for a valid timezone (Asia/Tokyo)', () => {
        const result = getDateStringInTimezone(timestamp, 'Asia/Tokyo');
        expect(result).toBe('2023-10-25');
    });

    it('should handle late night UTC correctly (Asia/Tokyo)', () => {
        const ts = '2023-10-25T22:00:00Z';
        const result = getDateStringInTimezone(ts, 'Asia/Tokyo');
        expect(result).toBe('2023-10-26');
    });

    it('should handle different input types (Date object)', () => {
        const date = new Date(timestamp);
        const result = getDateStringInTimezone(date, 'America/New_York');
        expect(result).toBe('2023-10-25');
    });

    it('should handle different input types (number timestamp)', () => {
        const num = new Date(timestamp).getTime();
        const result = getDateStringInTimezone(num, 'America/New_York');
        expect(result).toBe('2023-10-25');
    });

    it('should throw error when timezone is invalid or undefined instead of silent fallback', () => {
        const invalidTimezone = 'Invalid/Timezone';

        expect(() => getDateStringInTimezone(timestamp, invalidTimezone)).toThrow(/Error formatting date/);

        // Remove APP_TIMEZONE momentarily
        const originalTz = process.env.APP_TIMEZONE;
        delete process.env.APP_TIMEZONE;
        expect(() => getDateStringInTimezone(timestamp, undefined)).toThrow(/APP_TIMEZONE is not defined/);
        process.env.APP_TIMEZONE = originalTz;
    });

    it('should handle floating time string without Z suffix correctly', () => {
        const floatingString = '2023-10-25T15:00:00';
        const result = getDateStringInTimezone(floatingString, 'America/New_York');
        expect(result).toBeDefined();
    });
});
