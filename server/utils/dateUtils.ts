export const getDateStringInTimezone = (timestamp: string | Date | number, timezone: string): string => {
    try {
        const date = new Date(timestamp);
        // Use Intl.DateTimeFormat to format the date in the specified timezone
        const formatter = new Intl.DateTimeFormat('en-CA', { // 'en-CA' gives YYYY-MM-DD format
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // The output of en-CA is YYYY-MM-DD
        return formatter.format(date);
    } catch (error) {
        console.error(`Error formatting date for timezone ${timezone}:`, error);
        // Fallback to local date if timezone is invalid
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
};
