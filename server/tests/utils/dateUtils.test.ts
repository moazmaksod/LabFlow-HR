import { getDateStringInTimezone } from '../../utils/dateUtils.js';

describe('dateUtils - getDateStringInTimezone', () => {
    const timestamp = '2023-10-25T12:00:00Z'; // UTC date

    it('should format date correctly for a valid timezone (America/New_York)', () => {
        // 2023-10-25 12:00:00 UTC is 2023-10-25 08:00:00 EDT
        const result = getDateStringInTimezone(timestamp, 'America/New_York');
        expect(result).toBe('2023-10-25');
    });

    it('should format date correctly for a valid timezone (Asia/Tokyo)', () => {
        // 2023-10-25 12:00:00 UTC is 2023-10-25 21:00:00 JST
        const result = getDateStringInTimezone(timestamp, 'Asia/Tokyo');
        expect(result).toBe('2023-10-25');
    });

    it('should handle late night UTC correctly (Asia/Tokyo)', () => {
        // 2023-10-25 22:00:00 UTC is 2023-10-26 07:00:00 JST
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

    it('should fallback to UTC and log error when timezone is invalid', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const invalidTimezone = 'Invalid/Timezone';

        // 2023-10-25 12:00:00 UTC
        const result = getDateStringInTimezone(timestamp, invalidTimezone);

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Error formatting date for timezone ${invalidTimezone}:`),
            expect.any(Error)
        );
        expect(result).toBe('2023-10-25'); // UTC fallback for 12:00:00Z is 2023-10-25

        consoleSpy.mockRestore();
    });

    it('should fallback to UTC correctly for edge case dates (UTC)', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        // 2023-01-01 00:00:00 UTC
        const ts = '2023-01-01T00:00:00Z';
        const result = getDateStringInTimezone(ts, 'Invalid/Timezone');

        expect(result).toBe('2023-01-01');
        consoleSpy.mockRestore();
    });
});
