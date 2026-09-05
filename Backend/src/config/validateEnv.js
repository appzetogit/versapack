import { config } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Validates required environment configuration on startup.
 * Logs clear errors and exits if critical variables are missing.
 */
export const validateConfig = () => {
    const missing = [];

    if (!config.mongodbUri) {
        missing.push('MONGO_URI or MONGODB_URI');
    }
    if (!config.jwtAccessSecret) {
        missing.push('JWT_ACCESS_SECRET or JWT_SECRET');
    }
    if (!config.jwtRefreshSecret) {
        missing.push('JWT_REFRESH_SECRET');
    }
    if (config.redisEnabled && !config.redisUrl) {
        missing.push('REDIS_URL (required when REDIS_ENABLED=true)');
    }
    if (config.bullmqEnabled && !config.redisEnabled) {
        missing.push('REDIS_ENABLED=true (required when BULLMQ_ENABLED=true)');
    }

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }

    validateProductionSafety();
};

/**
 * Settings that are correct in development and dangerous in production.
 *
 * These are refused rather than warned about. A warning in a boot log is read once,
 * by whoever happened to be watching, and the .env that carries these values is the
 * same file that gets copied to the server — which is exactly how a development
 * default reaches production in the first place.
 */
const validateProductionSafety = () => {
    if (config.nodeEnv !== 'production') return;

    const unsafe = [];

    // Turns every OTP into a fixed literal ('1234' for phone login, '123456' for the
    // admin password reset) and skips the SMS entirely, so knowing a phone number is
    // enough to sign in as anybody, including an admin resetting their password.
    if (config.useDefaultOtp) {
        unsafe.push('USE_DEFAULT_OTP must not be true in production');
    }

    // Access tokens live in localStorage, so their lifetime is how long a single
    // stolen token stays useful. The refresh flow already exists to keep sessions
    // alive, which is what makes a short access token cheap.
    const accessTtlMs = parseDurationMs(config.jwtAccessExpiresIn);
    if (accessTtlMs !== null && accessTtlMs > 60 * 60 * 1000) {
        unsafe.push(
            `JWT_ACCESS_EXPIRES is ${config.jwtAccessExpiresIn}; must be 1h or less in production`
        );
    }

    if (unsafe.length > 0) {
        logger.error(`Unsafe production configuration: ${unsafe.join('; ')}`);
        process.exit(1);
    }
};

/** Parses the `1h` / `15m` / `7d` forms jsonwebtoken accepts. null when unparseable. */
const parseDurationMs = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    // A bare number is seconds, per the jsonwebtoken contract.
    if (/^\d+$/.test(raw)) return Number(raw) * 1000;

    const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(raw);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return amount * scale[unit];
};
