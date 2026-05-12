import { useNetworkStore } from '../store/useNetworkStore';

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
