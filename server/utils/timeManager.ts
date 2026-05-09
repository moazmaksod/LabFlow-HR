import logger from './logger.js';

export const getAppNow = (): string => {
    const timezone = process.env.APP_TIMEZONE;
    if (!timezone) {
        throw new Error("APP_TIMEZONE is not defined in environment variables. Critical configuration missing.");
    }

    const now = new Date();

    // Create formatter to get strictly the date in APP_TIMEZONE
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(now);
    const dateObj: Record<string, string> = {};
    for (const part of parts) {
        dateObj[part.type] = part.value;
    }

    // Return strict standardized string: YYYY-MM-DD HH:mm:ss without Z
    let hour = dateObj.hour;
    if (hour === '24') hour = '00';

    return `${dateObj.year}-${dateObj.month}-${dateObj.day}T${hour}:${dateObj.minute}:${dateObj.second}`;
};

export const parseAndFormat = (dateString: string | null, timezone?: string): string => {
    if (!dateString) return '-';

    const tz = timezone || process.env.APP_TIMEZONE;
    if (!tz) {
        throw new Error("APP_TIMEZONE is not defined in environment variables. Critical configuration missing.");
    }

    try {
        let dateToFormat: Date;
        let actualTz = tz;

        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            // "Floating time": "2026-05-05T15:00:46"
            // If we treat it as UTC by appending 'Z', and format it as 'UTC', it stays "15:00:46" in the UI.
            dateToFormat = new Date(dateString.replace(' ', 'T') + 'Z');
            actualTz = 'UTC';
        }

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: actualTz,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return formatter.format(dateToFormat);
    } catch (e) {
        logger.error(`Error parsing date string ${dateString} for timezone ${tz}`, e);
        throw new Error(`Invalid date string or timezone configuration: ${dateString}`);
    }
};

export const getDateStringInTimezone = (timestamp: string | Date | number, timezone?: string): string => {
    const tz = timezone || process.env.APP_TIMEZONE;
    if (!tz) {
        throw new Error("APP_TIMEZONE is not defined. Critical configuration missing.");
    }

    try {
        const date = new Date(timestamp);
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        return formatter.format(date);
    } catch (error) {
        throw new Error(`Error formatting date for timezone ${tz}`);
    }
};
