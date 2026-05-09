import { getAppNow, parseAndFormat } from '../../utils/timeManager.js';

describe('timeManager', () => {
    let originalTz: string | undefined;

    beforeAll(() => {
        originalTz = process.env.APP_TIMEZONE;
    });

    afterAll(() => {
        process.env.APP_TIMEZONE = originalTz;
    });

    it('getAppNow should return full ISO string without Z suffix', () => {
        process.env.APP_TIMEZONE = 'America/New_York';
        const result = getAppNow();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        expect(result).not.toContain('Z');
    });

    it('parseAndFormat should parse a string without Z suffix strictly relying on company timezone', () => {
        // Mock a DB floating string
        const dbString = '2026-05-05 15:00:46';
        const formatted = parseAndFormat(dbString, 'America/New_York');
        expect(formatted).toBeDefined();
        expect(formatted).not.toBe('-');
    });
});
