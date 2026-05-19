import { useAuthStore } from '../store/useAuthStore';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { format } from 'date-fns';

// Initialize performance anchor variables
let initTimeRef = Date.now();
let initPerfRef = performance.now();
let currentOffset = 0;

useAuthStore.subscribe((state) => {
    if (state.serverTimeOffset !== currentOffset) {
        currentOffset = state.serverTimeOffset;
        initTimeRef = Date.now() + currentOffset;
        initPerfRef = performance.now();
    }
});

export const getWebNow = (): string => {
    const elapsed = performance.now() - initPerfRef;
    const now = new Date(initTimeRef + elapsed);
    return now.toISOString();
};

export const getSystemNow = getWebNow;

export enum DateFormats {
    AUDIT_LOG = 'MMM dd, HH:mm',
    PAYROLL_VIEW = 'yyyy-MM-dd HH:mm',
    ANALYTICS_CHART = 'MMM dd',
    NATIVE_DATE_INPUT = 'yyyy-MM-dd'
}

export const getDeviceTimezone = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
        return 'UTC';
    }
};

export const getSupportedTimezones = (): string[] => {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch (e) {
        return [];
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
    dateString: string | null | undefined,
    userPreference?: string | null,
    formatString: string = 'MMM dd, HH:mm'
): string => {
    if (!dateString) return '-';

    const resolvedTimezone = resolveTimezone(userPreference);

    try {
        let dateToFormat: Date;
        const hasTimezone = dateString.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(dateString.trim());
        if (hasTimezone) {
            dateToFormat = new Date(dateString);
        } else {
            const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
            // Only append Z if it looks like a time string (contains a colon) to avoid breaking date-only strings
            const finalString = isoString.includes(':') ? `${isoString}Z` : isoString;
            dateToFormat = new Date(finalString);
        }

        return formatInTimeZone(dateToFormat, resolvedTimezone, formatString);
    } catch (e) {
        console.error(`Error formatting date string: ${dateString}`, e);
        return '-';
    }
};

export const formatForDateInput = (dateString: string | null, userPreference?: string | null): string => {
    if (!dateString) return '';
    return formatDisplayTime(dateString, userPreference, DateFormats.NATIVE_DATE_INPUT);
};

export const parseFromDateInput = (dateString: string, userPreference?: string | null): string => {
    if (!dateString) return '';

    // If the input is already a full ISO string (like from tests or preexisting data), we can parse it directly
    if (dateString.includes('T')) {
        return new Date(dateString).toISOString();
    }
    // Handle raw date strings that are already full Date string representations
    if (dateString.includes('GMT') || dateString.includes('Time')) {
        return new Date(dateString).toISOString();
    }

    const resolvedTimezone = resolveTimezone(userPreference);
    try {
        // Parse date as midnight in the resolved timezone and convert to UTC
        const date = toDate(`${dateString}T00:00:00`, { timeZone: resolvedTimezone });
        return date.toISOString();
    } catch (e) {
        console.error(`Error parsing date input: ${dateString}`, e);
        return '';
    }
};

export const getLocalDateParts = (timezone?: string | null): { month: number; year: number } => {
    const resolvedTimezone = resolveTimezone(timezone);
    const now = new Date(getSystemNow());

    // Use formatInTimeZone to safely extract the parts for the correct timezone
    try {
        const monthStr = formatInTimeZone(now, resolvedTimezone, 'M');
        const yearStr = formatInTimeZone(now, resolvedTimezone, 'yyyy');
        return {
            month: parseInt(monthStr, 10),
            year: parseInt(yearStr, 10)
        };
    } catch (e) {
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
    // Keep this function around for backwards compatibility if needed,
    // or refactor it to use the new formatDisplayTime.
    return formatDisplayTime(dateString, timezone, 'MMM d, HH:mm');
};
