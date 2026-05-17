import { useAuthStore } from '../store/useAuthStore';
import { formatInTimeZone } from 'date-fns-tz';
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

export const resolveTimezone = (userPreference?: string | null): string => {
    if (userPreference) {
        return userPreference;
    }
    try {
        const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTimezone) {
            return deviceTimezone;
        }
    } catch (e) {
        // Fallback to UTC if resolving device options fails
    }
    return 'UTC';
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
