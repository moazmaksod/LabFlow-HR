import { getAppNow, parseAndFormat } from '../../utils/timeManager.js';

describe('timeManager', () => {
    let originalTz: string | undefined;

    beforeAll(() => {
        originalTz = process.env.APP_TIMEZONE;
    });

    afterAll(() => {
        process.env.APP_TIMEZONE = originalTz;
    });

    it('getAppNow should return full ISO string WITH Z suffix', () => {
        process.env.APP_TIMEZONE = 'America/New_York';
        const result = getAppNow();
        expect(result).toContain('Z');
    });

    it('parseAndFormat should parse a string without Z suffix as UTC and shift to company timezone', () => {
        // Mock a DB floating string
        const dbString = '2026-05-05 15:00:46';
        // 15:00:46 UTC should become 11:00:46 EDT (America/New_York is UTC-4)
        const formatted = parseAndFormat(dbString, 'America/New_York');
        expect(formatted).toBeDefined();
        expect(formatted).not.toBe('-');
        expect(formatted).toContain('11:00'); // 15 - 4 = 11
    });
});
