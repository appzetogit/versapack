import http from 'http';
import express from 'express';

import { config } from './src/config/env.js';
import { validateConfig } from './src/config/validateEnv.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { connectRedis, closeRedis } from './src/config/redis.js';
import { initSocket } from './src/config/socket.js';
import { closeBullMQConnection } from './src/queues/index.js';
import { logger } from './src/utils/logger.js';
import { initializeFirebaseRealtime } from './src/config/firebase.js';

const SHUTDOWN_TIMEOUT_MS = 10000;
let server = null;

const app = express();
app.set('trust proxy', 1);
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'socket', port: Number(config.socketPort) });
});
app.get('/ready', (_req, res) => {
    res.status(200).json({ status: 'ready', service: 'socket' });
});

const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, starting socket server shutdown`);
    if (!server) {
        process.exit(0);
        return;
    }

    server.close(async () => {
        try {
            await disconnectDB();
            await closeRedis();
            await closeBullMQConnection();
            logger.info('Socket server shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error(`Socket shutdown error: ${err.message}`);
            process.exit(1);
        }
    });

    setTimeout(() => {
        logger.error('Socket shutdown timeout, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
};

const startSocketServer = async () => {
    try {
        validateConfig();
        initializeFirebaseRealtime();

        await connectDB();
        if (config.redisEnabled) {
            await connectRedis();
        }

        const httpServer = http.createServer(app);
        await initSocket(httpServer);

        server = httpServer.listen(config.socketPort, config.socketHost, () => {
            logger.info(`Socket server running in ${config.nodeEnv} mode on ${config.socketHost}:${config.socketPort}`);
            console.log(`Socket server URL http://localhost:${config.socketPort}`);
        });

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`Socket port ${config.socketPort} is already in use.`);
            } else {
                logger.error(`Socket Server Error: ${err.message}`);
            }
            process.exit(1);
        });

        process.on('unhandledRejection', (err) => {
            logger.error(`Socket server unhandled rejection: ${err?.message || err}`);
            if (server) server.close(() => process.exit(1));
            else process.exit(1);
        });

        process.on('uncaughtException', (err) => {
            logger.error(`Socket server uncaught exception: ${err?.message || err}`);
            process.exit(1);
        });
    } catch (error) {
        logger.error(`Error starting socket server: ${error.message}`);
        process.exit(1);
    }
};

startSocketServer();
