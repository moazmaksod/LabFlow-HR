import { useNetworkStore } from '../store/useNetworkStore';

let initTimeRef = Date.now();
let initPerfRef = performance.now();
let currentOffset = 0;

// Subscribe to offset changes from the network store
useNetworkStore.subscribe((state) => {
    if (state.serverTimeOffset !== currentOffset) {
        currentOffset = state.serverTimeOffset;
        initTimeRef = Date.now() + currentOffset;
        initPerfRef = performance.now();
    }
});

/**
 * Returns the current server-synchronized UTC time (ISO string)
 * using a monotonic clock to prevent OS sleep debt and local timezone issues.
 * This is the mandatory time source for mobile business logic.
 */
export const getMobileNow = (): string => {
    const elapsed = performance.now() - initPerfRef;
    const now = new Date(initTimeRef + elapsed);
    return now.toISOString();
};

export const parseAndFormat = (dateString: string | null, timezone?: string | null): string => {
    if (!dateString) return '-';
    if (!timezone) {
        throw new Error("Timezone is not defined. Critical configuration missing.");
    }

    try {
        let dateToFormat: Date;

        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            // Treat DB timestamps without 'Z' explicitly as UTC
            dateToFormat = new Date(dateString.replace(' ', 'T') + 'Z');
        }

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
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
