import express from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { sendError } from '../../utils/response.js';
import {
    removeFirebaseDeviceToken,
    sendTestNotification,
    upsertFirebaseDeviceToken
} from './firebase.service.js';
import { normalizePlatform } from '../../utils/platform.js';

const router = express.Router();

const getOwnerContext = (req) => ({
    ownerType: req.user?.role,
    ownerId: req.user?.userId
});

// Public health check for fcm-tokens service
router.get('/check', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'FCM tokens service is operational',
        timestamp: new Date().toISOString(),
        endpoints: ['/save', '/mobile/save', '/remove', '/test']
    });
});

// The two `/test-set-token/:phone/:token` and `/test-get-token/:phone` debug routes
// that used to sit here were removed.
//
// Both were unauthenticated and keyed on a phone number, so anyone who could guess
// a customer's number could bind their own device token to that account and start
// receiving its push notifications — which carry order ids and delivery links — or
// read back the tokens already registered on it. The /check endpoint above even
// advertised the path. Nothing in the apps called either route; they were left over
// from manual testing, and the authenticated /save, /mobile/save and /test routes
// below already cover every legitimate use.

router.post('/save', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.body?.token || '').trim();
        const platform = normalizePlatform(req.body?.platform);

        console.log(`[FCM-DEBUG] /save request received: ownerType=${ownerType}, ownerId=${ownerId}, platform=${platform}, tokenPreview=${token?.slice(0, 10)}...`);

        if (!ownerType || !ownerId) {
            console.warn('[FCM-DEBUG] /save - Authentication required');
            return sendError(res, 401, 'Authentication required');
        }

        await upsertFirebaseDeviceToken({ ownerType, ownerId, token, platform });
        console.log('[FCM-DEBUG] /save - Token saved successfully');
        return res.status(200).json({
            success: true,
            message: 'FCM token saved',
            data: { ownerType, ownerId, platform }
        });
    } catch (error) {
        next(error);
    }
});

router.post('/mobile/save', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.body?.token || '').trim();

        console.log(`[FCM-DEBUG] /mobile/save request received: ownerType=${ownerType}, ownerId=${ownerId}, tokenPreview=${token?.slice(0, 10)}...`);

        if (!ownerType || !ownerId) {
            console.warn('[FCM-DEBUG] /mobile/save - Authentication required');
            return sendError(res, 401, 'Authentication required');
        }

        if (!token) {
            console.warn('[FCM-DEBUG] /mobile/save - FCM token is required');
            return sendError(res, 400, 'FCM token is required');
        }

        await upsertFirebaseDeviceToken({ ownerType, ownerId, token, platform: 'mobile' });
        console.log('[FCM-DEBUG] /mobile/save - Token saved successfully');
        return res.status(200).json({
            success: true,
            message: 'Mobile FCM token saved successfully',
            data: { ownerType, ownerId, platform: 'mobile' }
        });
    } catch (error) {
        next(error);
    }
});

const handleRemoveToken = async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const token = String(req.params?.token || req.body?.token || '').trim();
        const platform = normalizePlatform(req.body?.platform, { allowUndefined: true });

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        await removeFirebaseDeviceToken({ ownerType, ownerId, token, platform });
        return res.status(200).json({
            success: true,
            message: 'FCM token removed'
        });
    } catch (error) {
        next(error);
    }
};

router.delete('/remove', authMiddleware, handleRemoveToken);
router.delete('/remove/:token', authMiddleware, handleRemoveToken);

router.post('/test', authMiddleware, async (req, res, next) => {
    try {
        const { ownerType, ownerId } = getOwnerContext(req);
        const platform = normalizePlatform(req.body?.platform, { allowUndefined: true });

        if (!ownerType || !ownerId) {
            return sendError(res, 401, 'Authentication required');
        }

        const result = await sendTestNotification({ ownerType, ownerId, platform });
        return res.status(200).json({
            success: true,
            message: 'Test notification sent',
            data: result
        });
    } catch (error) {
        next(error);
    }
});

export default router;
