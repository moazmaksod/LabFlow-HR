/**
 * 🛡️ SECURITY: Rate limiting middleware for authentication endpoints.
 *
 * VULNERABILITY PREVENTED: Brute force attacks on /api/auth/login.
 * Without rate limiting, an attacker can make thousands of password
 * guesses per second against any known email address.
 *
 * IMPLEMENTATION: In-memory sliding window rate limiter.
 * - Uses Map with automatic expiry cleanup to avoid memory leaks.
 * - No external dependency needed (express-rate-limit would require npm install).
 * - Separate limits for login (stricter) vs register (more lenient).
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
    count: number;
    resetAt: number; // Unix timestamp in ms
}

// Separate stores for different endpoints to allow fine-grained control
const loginAttempts = new Map<string, RateLimitEntry>();
const registerAttempts = new Map<string, RateLimitEntry>();

// Cleanup interval: purge expired entries every 10 minutes to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts.entries()) {
        if (entry.resetAt < now) loginAttempts.delete(key);
    }
    for (const [key, entry] of registerAttempts.entries()) {
        if (entry.resetAt < now) registerAttempts.delete(key);
    }
}, 10 * 60 * 1000);

/**
 * Creates a rate limit middleware with the given configuration.
 * @param store - The Map to track attempts per IP
 * @param maxAttempts - Max allowed attempts in the window
 * @param windowMs - Time window in milliseconds
 * @param message - Error message to return when limit exceeded
 */
function createRateLimiter(
    store: Map<string, RateLimitEntry>,
    maxAttempts: number,
    windowMs: number,
    message: string
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Use X-Forwarded-For for proxy environments, fallback to direct IP
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.socket.remoteAddress
            || 'unknown';

        const now = Date.now();
        const entry = store.get(ip);

        if (!entry || entry.resetAt < now) {
            // First attempt or window expired — start fresh
            store.set(ip, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (entry.count >= maxAttempts) {
            const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', retryAfterSeconds);
            res.status(429).json({
                error: message,
                retryAfter: retryAfterSeconds,
            });
            return;
        }

        entry.count++;
        next();
    };
}

/**
 * 🔒 Login rate limiter: 10 attempts per 15 minutes per IP.
 * This allows legitimate users with forgotten passwords a few tries
 * while making brute force attacks impractical.
 */
export const loginRateLimiter = createRateLimiter(
    loginAttempts,
    10,            // max 10 attempts
    15 * 60 * 1000, // per 15-minute window
    'Too many login attempts. Please try again in a few minutes.'
);

/**
 * 🔒 Registration rate limiter: 5 accounts per hour per IP.
 * Prevents account flooding / spam registration attacks.
 */
export const registerRateLimiter = createRateLimiter(
    registerAttempts,
    5,               // max 5 registrations
    60 * 60 * 1000,  // per 1-hour window
    'Too many registration attempts. Please try again later.'
);
