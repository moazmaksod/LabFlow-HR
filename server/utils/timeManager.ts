import logger from './logger.js';

export const getAppNow = (): string => {
    const timezone = process.env.APP_TIMEZONE;
    if (!timezone) {
        throw new Error("APP_TIMEZONE is not defined in environment variables. Critical configuration missing.");
    }
    return new Date().toISOString();
};

export const parseAndFormat = (dateString: string | null, timezone?: string): string => {
    if (!dateString) return '-';

    const tz = timezone || process.env.APP_TIMEZONE;
    if (!tz) {
        throw new Error("APP_TIMEZONE is not defined in environment variables. Critical configuration missing.");
    }

    try {
        let dateToFormat: Date;

        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            dateToFormat = new Date(dateString.replace(' ', 'T') + 'Z');
        }

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
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
        logger.error(`Error formatting date for timezone ${tz}:`, error);
        // Fallback to UTC if timezone is invalid
        const d = new Date(timestamp);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
};

export const validateClientTimestamp = (clientTimestamp: string): boolean => {
    const clientTime = new Date(clientTimestamp).getTime();
    const serverTime = Date.now();

    // Accept up to 60 seconds of deviation
    if (Math.abs(serverTime - clientTime) > 60000) {
        return false;
    }
    return true;
};
