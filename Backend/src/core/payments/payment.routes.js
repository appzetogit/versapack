import express from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { requireRoles } from '../roles/role.middleware.js';
import {
    getPaymentHistoryController,
    getOrderTransactionsController,
    getUserWalletBalanceController,
    getUserWalletTransactionsController,
    getRestaurantWalletController,
    getDeliveryWalletController,
    getAdminWalletController,
    getAdminFinanceSummaryController,
    listSettlementsController,
    createSettlementController,
    processSettlementController,
    listRefundsController,
    getRefundsByOrderController
} from './payment.controller.js';

const router = express.Router();

// ─── Payment history for an order (user sees their payment trail) ───
router.get('/orders/:orderId/payments', getPaymentHistoryController);
router.get('/orders/:orderId/transactions', getOrderTransactionsController);
router.get('/orders/:orderId/refunds', getRefundsByOrderController);

// ─── User wallet (new transaction-based endpoints) ───
router.get('/wallet/balance', getUserWalletBalanceController);
router.get('/wallet/transactions', getUserWalletTransactionsController);

// ─── Restaurant wallet ───
router.get('/restaurant/:restaurantId/wallet', getRestaurantWalletController);

// ─── Delivery partner wallet ───
router.get('/delivery/:deliveryPartnerId/wallet', getDeliveryWalletController);

// ─── Admin / Finance ───
//
// This router is mounted with authMiddleware but NO role guard, so until this
// block was added every one of these was reachable with any valid token — a
// customer's, a rider's, a seller's. That exposed platform revenue and, worse,
// let any account create and process settlements, which moves money out.
//
// Guarded here rather than at the mount point because the routes above are
// legitimately multi-role.
const adminOnly = [authMiddleware, requireRoles('ADMIN')];

router.get('/admin/wallet', ...adminOnly, getAdminWalletController);
router.get('/admin/finance/summary', ...adminOnly, getAdminFinanceSummaryController);
router.get('/admin/settlements', ...adminOnly, listSettlementsController);
router.post('/admin/settlements', ...adminOnly, createSettlementController);
router.post('/admin/settlements/:id/process', ...adminOnly, processSettlementController);
router.get('/admin/refunds', ...adminOnly, listRefundsController);

export default router;
