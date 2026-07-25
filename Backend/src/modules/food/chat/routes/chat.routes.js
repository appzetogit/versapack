import express from 'express';
import {
    sendMessageController,
    listConversationsController,
    getHistoryController,
    markReadController
} from '../controllers/chat.controller.js';

const router = express.Router();

// Auth + role gating applied where mounted (routes/index.js).
router.post('/messages', sendMessageController);
router.get('/messages', getHistoryController);
router.get('/conversations', listConversationsController);
router.patch('/conversations/:conversationId/read', markReadController);

export default router;
