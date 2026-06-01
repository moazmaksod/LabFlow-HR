import { useNetworkStore } from '../store/useNetworkStore';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { format } from 'date-fns';

export { timezones, simplifiedTimezones } from './timezones.data';

let initTimeRef = Date.now();
let initPerfRef = global.performance ? global.performance.now() : Date.now();
let currentOffset = 0;

// Subscribe to offset changes from the network store
useNetworkStore.subscribe((state) => {
    if (state.serverTimeOffset !== currentOffset) {
        currentOffset = state.serverTimeOffset;
        initTimeRef = Date.now() + currentOffset;
        initPerfRef = global.performance ? global.performance.now() : Date.now();
    }
});

/**
 * Returns the current server-synchronized UTC time (ISO string)
 * using a monotonic clock to prevent OS sleep debt and local timezone issues.
 * This is the mandatory time source for mobile business logic.
 */
export const getMobileNow = (): string => {
    const currentPerf = global.performance ? global.performance.now() : Date.now();
    const elapsed = currentPerf - initPerfRef;
    const now = new Date(initTimeRef + elapsed);
    return now.toISOString();
};

export const getSystemNow = getMobileNow;

export enum DateFormats {
    AUDIT_LOG = 'MMM dd, HH:mm',
    PAYROLL_VIEW = 'yyyy-MM-dd HH:mm',
    ANALYTICS_CHART = 'MMM dd',
    NATIVE_DATE_INPUT = 'yyyy-MM-dd'
}

export const getDeviceTimezone = (): string => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!tz) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.warn("getDeviceTimezone: Intl resolved options returned empty. Defaulting to UTC.");
            }
            return 'UTC';
        }
        return tz;
    } catch (e) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.error("getDeviceTimezone: Failed to resolve mobile timezone. Defaulting to UTC.", e);
        }
        return 'UTC';
    }
};

export const is12HourSystem = (): boolean => {
    try {
        return Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 || false;
    } catch (e) {
        return false; // Fallback to 24h
    }
};

export const resolveTimezone = (userPreference?: string | null): string => {
    if (userPreference) {
        return userPreference;
    }
    return getDeviceTimezone();
};

export const calculateHoursBetween = (startTime: string | null, endTime?: string): number => {
    if (!startTime) return 0;
    const end = endTime ? getTimestamp(endTime) : new Date(getSystemNow()).getTime();
    const start = getTimestamp(startTime);
    const diff = end - start;
    return diff > 0 ? diff / (1000 * 60 * 60) : 0;
};

export const formatDuration = (totalMins: number): string => {
    if (!totalMins || totalMins < 0) return '00:00';
    const hours = Math.floor(totalMins / 60);
    const mins = Math.floor(totalMins % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

export const getTimestamp = (isoString: string): number => {
    if (!isoString) return 0;
    const normalized = isoString.replace(' ', 'T');
    const finalString = normalized.includes(':') && !normalized.endsWith('Z')
        ? `${normalized}Z`
        : normalized;
    return new Date(finalString).getTime();
};

export const formatDisplayTime = (
    dateString: Date | string | number | null | undefined,
    userPreference?: string | null,
    formatString: string = 'MMM dd, HH:mm'
): string => {
    if (!dateString) return '-';

    const resolvedTimezone = resolveTimezone(userPreference);

    // Dynamically respect system 12h/24h preference
    let finalFormatString = formatString;
    if (finalFormatString.includes('HH:mm')) {
        finalFormatString = finalFormatString.replace('HH:mm', is12HourSystem() ? 'hh:mm a' : 'HH:mm');
    }

    try {
        let dateToFormat: Date;
        if (dateString instanceof Date) {
            dateToFormat = dateString;
        } else if (typeof dateString === 'number') {
            dateToFormat = new Date(dateString);
        } else {
            const trimmed = dateString.trim();
            const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
            if (isDateOnly) {
                dateToFormat = toDate(`${trimmed}T00:00:00`, { timeZone: resolvedTimezone });
            } else {
                const hasTimezone = trimmed.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed);
                if (hasTimezone) {
                    dateToFormat = new Date(trimmed);
                } else {
                    const isoString = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
                    const finalString = isoString.includes(':') ? `${isoString}Z` : isoString;
                    dateToFormat = new Date(finalString);
                }
            }
        }

        if (isNaN(dateToFormat.getTime())) return '-';
        return formatInTimeZone(dateToFormat, resolvedTimezone, finalFormatString);
    } catch (e) {
        console.error(`Error formatting date string: ${dateString}`, e);
        return '-';
    }
};

export const formatDisplayDate = (
    dateString: Date | string | number | null | undefined,
    userPreference?: string | null,
    formatString: string = 'EEE, MMM d'
): string => {
    if (!dateString) return '-';
    // Normalize input to date string
    const normalizedString = dateString instanceof Date 
        ? dateString.toISOString() 
        : (typeof dateString === 'number' ? new Date(dateString).toISOString() : dateString);
    return formatDisplayTime(normalizedString, userPreference, formatString);
};

export const formatTimeString = (
    timeStr: string | null | undefined,
    userPreference?: string | null,
    formatString: string = 'HH:mm'
): string => {
    if (!timeStr) return '--:--';

    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '--:--';

    // Anchor to Jan 1, 1970 UTC to achieve absolute stability for time-only formatting
    const utcDate = new Date(0);
    utcDate.setUTCHours(h, m, 0, 0);

    // Enforce 'UTC' timeline parsing to lock the extracted hours/minutes exactly as parsed
    let finalFormatString = formatString;
    if (finalFormatString.includes('HH:mm')) {
        finalFormatString = finalFormatString.replace('HH:mm', is12HourSystem() ? 'hh:mm a' : 'HH:mm');
    }

    return formatInTimeZone(utcDate, 'UTC', finalFormatString);
};

export const formatForDateInput = (dateString: string | null, userPreference?: string | null): string => {
    if (!dateString) return '';
    return formatDisplayTime(dateString, userPreference, DateFormats.NATIVE_DATE_INPUT);
};

export const parseFromDateInput = (dateString: string, userPreference?: string | null): string => {
    if (!dateString) return '';

    if (dateString.includes('T')) {
        return new Date(dateString).toISOString();
    }
    if (dateString.includes('GMT') || dateString.includes('Time')) {
        return new Date(dateString).toISOString();
    }

    const resolvedTimezone = resolveTimezone(userPreference);
    try {
        const date = toDate(`${dateString}T00:00:00`, { timeZone: resolvedTimezone });
        return date.toISOString();
    } catch (e) {
        console.error(`Error parsing date input: ${dateString}`, e);
        return '';
    }
};

export const formatTimeOnlyToLocal = (utcTimeStr: string, userPreference?: string | null): string => {
    if (!utcTimeStr) return '';
    try {
        const resolvedTimezone = resolveTimezone(userPreference);
        const todayStr = new Date().toISOString().split('T')[0];
        const date = new Date(`${todayStr}T${utcTimeStr}:00Z`);
        const finalFormatString = is12HourSystem() ? 'hh:mm a' : 'HH:mm';
        return formatInTimeZone(date, resolvedTimezone, finalFormatString);
    } catch (e) {
        console.error(`Error formatting time only: ${utcTimeStr}`, e);
        return utcTimeStr;
    }
};

export const parseTimeOnlyToUTC = (localTimeStr: string, userPreference?: string | null): string => {
    if (!localTimeStr) return '';
    try {
        const resolvedTimezone = resolveTimezone(userPreference);
        const now = new Date();
        const localDateStr = formatInTimeZone(now, resolvedTimezone, 'yyyy-MM-dd');
        const date = toDate(`${localDateStr}T${localTimeStr}:00`, { timeZone: resolvedTimezone });
        return formatInTimeZone(date, 'UTC', 'HH:mm');
    } catch (e) {
        console.error(`Error parsing time only: ${localTimeStr}`, e);
        return localTimeStr;
    }
};

export const getLocalDateParts = (timezone?: string | null): { month: number; year: number } => {
    const resolvedTimezone = resolveTimezone(timezone);
    const now = new Date(getSystemNow());

    try {
        const monthStr = formatInTimeZone(now, resolvedTimezone, 'M');
        const yearStr = formatInTimeZone(now, resolvedTimezone, 'yyyy');
        return {
            month: parseInt(monthStr, 10),
            year: parseInt(yearStr, 10)
        };
    } catch (e) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.error("getLocalDateParts: Failed to format date in timezone, falling back to UTC", e);
        }
        return {
            month: now.getUTCMonth() + 1,
            year: now.getUTCFullYear()
        };
    }
};

let cachedLocalizedMonths: { value: number; label: string }[] | null = null;

export const getLocalizedMonths = (): { value: number; label: string }[] => {
    if (cachedLocalizedMonths) {
        return cachedLocalizedMonths;
    }
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'long' });

    cachedLocalizedMonths = Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: formatter.format(new Date(2000, i, 1))
    }));
    return cachedLocalizedMonths;
};

export const parseAndFormat = (dateString: string | null, timezone?: string | null): string => {
    return formatDisplayTime(dateString, timezone, 'MMM d, HH:mm');
};

export const calculateTenure = (hireDate: string | null): string => {
    if (!hireDate) return 'Not set';
    const start = new Date(hireDate);
    const now = new Date();

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);

    return parts.length > 0 ? parts.join(', ') : 'Less than a month';
};
