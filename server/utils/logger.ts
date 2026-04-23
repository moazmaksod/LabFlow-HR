const getTimestamp = () => new Date().toISOString();

const logger = {
    info: (...args: any[]) => {
        if (process.env.NODE_ENV === 'test') return;
        if (process.env.NODE_ENV === 'production') return;
        console.info(`[${getTimestamp()}] [INFO]`, ...args);
    },
    debug: (...args: any[]) => {
        if (process.env.NODE_ENV === 'test') return;
        if (process.env.NODE_ENV === 'production') return;
        console.debug(`[${getTimestamp()}] [DEBUG]`, ...args);
    },
    warn: (...args: any[]) => {
        if (process.env.NODE_ENV === 'test') return;
        if (process.env.NODE_ENV === 'production') {
            console.warn(...args);
            return;
        }
        console.warn(`[${getTimestamp()}] [WARN]`, ...args);
    },
    error: (...args: any[]) => {
        if (process.env.NODE_ENV === 'test') return;
        if (process.env.NODE_ENV === 'production') {
            console.error(...args);
            return;
        }
        console.error(`[${getTimestamp()}] [ERROR]`, ...args);
    }
};

export default logger;
