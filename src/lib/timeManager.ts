import { useAuthStore } from '../store/useAuthStore';

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

export const parseAndFormat = (dateString: string | null, timezone?: string | null): string => {
    if (!dateString) return '-';

    // If user's timezone is null/empty, fallback to device's system timezone
    const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!resolvedTimezone) {
        throw new Error("Timezone is not defined. Critical configuration missing.");
    }

    try {
        let dateToFormat: Date;
        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            dateToFormat = new Date(dateString.replace(' ', 'T') + 'Z');
        }

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: resolvedTimezone,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return formatter.format(dateToFormat);
    } catch (e) {
        throw new Error(`Invalid date string or timezone configuration: ${dateString}`);
    }
};
