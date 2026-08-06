import express from 'express';
import {
    getInboxController,
    markNotificationReadController,
    dismissNotificationController,
    markAllNotificationsReadController,
    dismissAllNotificationsController
} from './notification.controller.js';

const router = express.Router();

router.get('/inbox', getInboxController);
router.patch('/:id/read', markNotificationReadController);
router.delete('/:id', dismissNotificationController);
// Clearing the badge, as opposed to clearing the inbox below.
router.patch('/inbox/read-all', markAllNotificationsReadController);
router.delete('/inbox/all', dismissAllNotificationsController);

export default router;
