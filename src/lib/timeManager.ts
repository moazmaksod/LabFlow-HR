export const parseAndFormat = (dateString: string | null, timezone?: string | null): string => {
    if (!dateString) return '-';
    if (!timezone) {
        throw new Error("Timezone is not defined. Critical configuration missing.");
    }

    try {
        let dateToFormat: Date;
        let actualTz = timezone;

        if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
            dateToFormat = new Date(dateString);
        } else {
            // Treat SQLite default timestamps and getAppNow() floating times as UTC explicitly to prevent double-shifting.
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
        throw new Error(`Invalid date string or timezone configuration: ${dateString}`);
    }
};
