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
        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            // Append Z if missing to ensure it is parsed as UTC
            dateToFormat = new Date(dateString.replace(' ', 'T') + 'Z');
        }

        return formatInTimeZone(dateToFormat, resolvedTimezone, formatString);
    } catch (e) {
        console.error(`Error formatting date string: ${dateString}`, e);
        return '-';
    }
};

export const getLocalizedMonths = (): { value: number; label: string }[] => {
    return Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: format(new Date(2000, i, 1), 'MMMM')
    }));
};

export const parseAndFormat = (dateString: string | null, timezone?: string | null): string => {
    // Keep this function around for backwards compatibility if needed,
    // or refactor it to use the new formatDisplayTime.
    return formatDisplayTime(dateString, timezone, 'MMM d, HH:mm');
};
