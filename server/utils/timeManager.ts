import logger from './logger.js';

export const getAppNow = (): string => {
    return new Date().toISOString();
};

export const getDifferenceInMinutes = (start: string | Date, end: string | Date): number => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setSeconds(0, 0);
    startDate.setMilliseconds(0);
    endDate.setSeconds(0, 0);
    endDate.setMilliseconds(0);
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
};

export const parseAndFormat = (dateString: string | null, timezone?: string): string => {
    if (!dateString) return '-';

    const tz = timezone || 'UTC';

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



export const validateClientTimestamp = (clientTimestamp: string): boolean => {
    const clientTime = new Date(clientTimestamp).getTime();
    const serverTime = Date.now();

    // Accept up to 60 seconds of deviation
    if (Math.abs(serverTime - clientTime) > 60000) {
        return false;
    }
    return true;
};
