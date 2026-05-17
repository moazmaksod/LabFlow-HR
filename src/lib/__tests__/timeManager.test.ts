import { resolveTimezone, formatDisplayTime, getLocalizedMonths } from '../timeManager';

describe('timeManager', () => {
    describe('resolveTimezone', () => {
        it('should return user preference if provided', () => {
            expect(resolveTimezone('America/New_York')).toBe('America/New_York');
        });
        it('should fallback to device timezone if user preference is falsy', () => {
            const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            expect(resolveTimezone(null)).toBe(deviceTz);
        });
    });

    describe('formatDisplayTime', () => {
        it('should format a valid date string with a specific timezone', () => {
            const dateStr = '2023-01-01T12:00:00Z'; // UTC time
            // New York is UTC-5 in Jan
            expect(formatDisplayTime(dateStr, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('2023-01-01 07:00');
        });
        it('should handle date strings without Z suffix', () => {
            const dateStr = '2023-01-01 12:00:00';
            expect(formatDisplayTime(dateStr, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('2023-01-01 07:00');
        });
        it('should return "-" if dateString is empty', () => {
            expect(formatDisplayTime(null, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('-');
        });
    });

    describe('getLocalizedMonths', () => {
        it('should return 12 localized months', () => {
            const months = getLocalizedMonths();
            expect(months.length).toBe(12);
            expect(months[0].value).toBe(1);
            expect(months[0].label).toBe('January');
            expect(months[11].value).toBe(12);
            expect(months[11].label).toBe('December');
        });
    });
});
