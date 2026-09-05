import { sendResponse, sendError } from '../../utils/response.js';
import { getPaymentsByOrder } from './payment.service.js';
import { getTransactionsByOrder } from './transaction.service.js';
import { getWalletBalance, getWalletWithTransactions, getUserWalletForFrontend } from './wallet.service.js';
import { getRefundsByOrder, listRefunds } from './refund.service.js';
import { createSettlement, processSettlement, listSettlements } from './settlement.service.js';
import { logger } from '../../utils/logger.js';

// ─── User Endpoints ───

/**
 * True when the caller is a party to this order, or an admin.
 *
 * The three order-scoped endpoints below take an order id straight from the path
 * and returned its payment trail, ledger and refunds to anyone holding any valid
 * token. Order ids are sequential-ish (`FOD-…`) and appear in shared links, so
 * walking another customer's payment history took no guesswork at all.
 *
 * Mirrors the participant test the tracking socket already applies in
 * config/socket.js — same three roles, same comparison — so a single order has one
 * definition of "yours" across HTTP and websocket.
 *
 * Imported dynamically to keep core/payments free of a static edge into the food
 * order module, which is what config/socket.js does for the same reason.
 */
const assertOrderParticipant = async (req, res) => {
    const role = String(req.user?.role || '').toUpperCase();
    const me = String(req.user?.userId || '');
    const rawOrderId = req.params?.orderId;

    if (role === 'ADMIN') return true;
    if (!me || !rawOrderId) {
        sendError(res, 403, 'Forbidden: insufficient permissions');
        return false;
    }

    const [{ FoodOrder }, { buildOrderIdentityFilter }] = await Promise.all([
        import('../../modules/food/orders/models/order.model.js'),
        import('../../modules/food/orders/services/order.helpers.js')
    ]);

    const identity = buildOrderIdentityFilter(rawOrderId);
    if (!identity) {
        sendError(res, 400, 'Invalid order id');
        return false;
    }

    const order = await FoodOrder.findOne(identity)
        .select('userId restaurantId dispatch.deliveryPartnerId')
        .lean();

    // A missing order and an order belonging to someone else answer identically,
    // so this cannot be used to probe which ids exist.
    const isParticipant =
        !!order &&
        ((role === 'USER' && String(order.userId || '') === me) ||
            (role === 'RESTAURANT' && String(order.restaurantId || '') === me) ||
            (role === 'DELIVERY_PARTNER' &&
                String(order.dispatch?.deliveryPartnerId || '') === me));

    if (!isParticipant) {
        logger.warn(`payments: ${role}:${me} denied access to order ${rawOrderId}`);
        sendError(res, 403, 'Forbidden: insufficient permissions');
        return false;
    }
    return true;
};

export const getPaymentHistoryController = async (req, res, next) => {
    try {
        if (!(await assertOrderParticipant(req, res))) return;
        const { orderId } = req.params;
        const payments = await getPaymentsByOrder(orderId);
        return sendResponse(res, 200, 'Payment history fetched', { payments });
    } catch (err) {
        next(err);
    }
};

export const getOrderTransactionsController = async (req, res, next) => {
    try {
        if (!(await assertOrderParticipant(req, res))) return;
        const { orderId } = req.params;
        const transactions = await getTransactionsByOrder(orderId);
        return sendResponse(res, 200, 'Transactions fetched', { transactions });
    } catch (err) {
        next(err);
    }
};

export const getUserWalletBalanceController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const data = await getWalletBalance('user', userId);
        return sendResponse(res, 200, 'Balance fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getUserWalletTransactionsController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('user', userId, { page, limit });
        return sendResponse(res, 200, 'Wallet transactions fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Restaurant Endpoints ───

/**
 * Resolves which entity's wallet the caller is allowed to read.
 *
 * These two handlers used to read `req.user?.restaurantId || req.params.restaurantId`.
 * authMiddleware only ever sets `userId`, `role` and `adminType` — `restaurantId` and
 * `deliveryPartnerId` are never populated on req.user — so that expression ALWAYS fell
 * through to the URL parameter. Any authenticated account could therefore read any
 * seller's or rider's balance and full transaction history by changing the id in the
 * path.
 *
 * A role's own id is its token subject (`userId` is the document _id for every role),
 * so the owning role is pinned to itself and only ADMIN may name someone else.
 */
const resolveWalletOwnerId = (req, ownerRole, paramName) => {
    const role = String(req.user?.role || '').toUpperCase();
    const requested = String(req.params?.[paramName] || '').trim();

    if (role === 'ADMIN') {
        return requested || null;
    }
    if (role === ownerRole) {
        // Ignore the path entirely rather than comparing it: a seller reading their
        // own wallet through someone else's id is never a legitimate request.
        return String(req.user.userId);
    }
    return null;
};

export const getRestaurantWalletController = async (req, res, next) => {
    try {
        const restaurantId = resolveWalletOwnerId(req, 'RESTAURANT', 'restaurantId');
        if (!restaurantId) {
            return sendError(res, 403, 'Forbidden: insufficient permissions');
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('restaurant', restaurantId, { page, limit });
        return sendResponse(res, 200, 'Store wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Delivery Partner Endpoints ───

export const getDeliveryWalletController = async (req, res, next) => {
    try {
        const deliveryPartnerId = resolveWalletOwnerId(req, 'DELIVERY_PARTNER', 'deliveryPartnerId');
        if (!deliveryPartnerId) {
            return sendError(res, 403, 'Forbidden: insufficient permissions');
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('deliveryBoy', deliveryPartnerId, { page, limit });
        return sendResponse(res, 200, 'Delivery wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Admin Endpoints ───

export const getAdminWalletController = async (req, res, next) => {
    try {
        const data = await getWalletBalance('admin', 'platform');
        return sendResponse(res, 200, 'Admin wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getAdminFinanceSummaryController = async (req, res, next) => {
    try {
        const { FoodAdminWallet } = await import('../../modules/food/admin/models/adminWallet.model.js');
        const adminWallet = await FoodAdminWallet.findOne({ key: 'platform' }).lean();
        const pendingSettlements = await listSettlements({ status: 'pending', limit: 100 });
        const pendingRefunds = await listRefunds({ status: 'pending', limit: 100 });

        return sendResponse(res, 200, 'Finance summary', {
            platform: {
                balance: adminWallet?.balance || 0,
                totalRevenue: adminWallet?.totalRevenue || 0,
                totalPayouts: adminWallet?.totalPayouts || 0,
                totalRefunds: adminWallet?.totalRefunds || 0
            },
            pendingSettlements: {
                count: pendingSettlements.total,
                totalAmount: pendingSettlements.settlements.reduce((s, v) => s + (v.amount || 0), 0)
            },
            pendingRefunds: {
                count: pendingRefunds.total,
                totalAmount: pendingRefunds.refunds.reduce((s, v) => s + (v.amount || 0), 0)
            }
        });
    } catch (err) {
        next(err);
    }
};

export const listSettlementsController = async (req, res, next) => {
    try {
        const { entityType, entityId, status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await listSettlements({ entityType, entityId, status, page, limit });
        return sendResponse(res, 200, 'Settlements fetched', data);
    } catch (err) {
        next(err);
    }
};

export const createSettlementController = async (req, res, next) => {
    try {
        const { entityType, entityId, amount, notes, periodStart, periodEnd } = req.body;
        const settlement = await createSettlement({ entityType, entityId, amount, notes, periodStart, periodEnd });
        return sendResponse(res, 201, 'Settlement created', { settlement });
    } catch (err) {
        next(err);
    }
};

export const processSettlementController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.userId;
        const { payoutRef } = req.body;
        const settlement = await processSettlement(id, { processedBy: adminId, payoutRef });
        return sendResponse(res, 200, 'Settlement processed', { settlement });
    } catch (err) {
        next(err);
    }
};

export const listRefundsController = async (req, res, next) => {
    try {
        const { status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await listRefunds({ status, page, limit });
        return sendResponse(res, 200, 'Refunds fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getRefundsByOrderController = async (req, res, next) => {
    try {
        if (!(await assertOrderParticipant(req, res))) return;
        const { orderId } = req.params;
        const refunds = await getRefundsByOrder(orderId);
        return sendResponse(res, 200, 'Refunds fetched', { refunds });
    } catch (err) {
        next(err);
    }
};
