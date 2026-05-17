import { useNetworkStore } from '../store/useNetworkStore';

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

/**
 * Resolves the timezone to use for displaying dates and times.
 * Hierarchy: User Choice -> Device Default -> UTC.
 */
export const resolveTimezone = (userChoice?: string | null): string => {
    if (userChoice) return userChoice;

    try {
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTz) return deviceTz;
    } catch (e) {
        console.warn('Failed to resolve device timezone, falling back to UTC', e);
    }

    return 'UTC';
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getCachedFormatter = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
    const key = JSON.stringify(options, Object.keys(options).sort());
    let formatter = formatterCache.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(undefined, options);
        formatterCache.set(key, formatter);
    }
    return formatter;
};

/**
 * Formats a Date object or ISO string to a display time string.
 */
export const formatDisplayTime = (
    dateInput: Date | string | number | null | undefined,
    userTimezone?: string | null,
    options?: Intl.DateTimeFormatOptions
): string => {
    if (!dateInput) return '--:--';

    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '--:--';

    const tz = resolveTimezone(userTimezone);
    const defaultOptions: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit'
    };
    const finalOptions = { ...defaultOptions, ...options };
    return getCachedFormatter(finalOptions).format(date);
};

/**
 * Formats a Date object or ISO string to a display date string.
 */
export const formatDisplayDate = (
    dateInput: Date | string | number | null | undefined,
    userTimezone?: string | null,
    options?: Intl.DateTimeFormatOptions
): string => {
    if (!dateInput) return '--/--/----';

    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '--/--/----';

    const tz = resolveTimezone(userTimezone);
    const defaultOptions: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    };
    const finalOptions = { ...defaultOptions, ...options };
    return getCachedFormatter(finalOptions).format(date);
};

/**
 * Formats a raw 'HH:mm' time string safely using a fixed Unix Epoch base (new Date(0))
 * to eliminate date boundary shifts and daylight saving (DST) edge cases.
 */
export const formatTimeString = (
    timeStr: string | null | undefined,
    userTimezone?: string | null,
    options?: Intl.DateTimeFormatOptions
): string => {
    if (!timeStr) return '--:--';

    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '--:--';

    // Anchor to Jan 1, 1970 UTC to achieve absolute stability for time-only formatting
    const utcDate = new Date(0);
    utcDate.setUTCHours(h, m, 0, 0);

    // Enforce 'UTC' timeline parsing to lock the extracted hours/minutes exactly as parsed
    return formatDisplayTime(utcDate, userTimezone, {
        timeZone: 'UTC',
        ...options
    });
};

