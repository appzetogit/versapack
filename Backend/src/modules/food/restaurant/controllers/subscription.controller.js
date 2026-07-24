import mongoose from 'mongoose';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodSubscriptionInvoice } from '../models/subscriptionInvoice.model.js';
import { FoodSubscriptionTransaction } from '../models/subscriptionTransaction.model.js';
import {
    computeMonthlyGmv,
    getMonthWindow,
    formatBillingMonth,
    billingMonthLabel,
    getOutstandingSummary,
} from '../services/subscriptionBilling.service.js';
import { getRestaurantFinance } from '../services/restaurantFinance.service.js';
import { getRestaurantSubscriptionSettings } from '../../admin/services/admin.service.js';
import { FEATURE_KEYS, isFeatureEnabled } from '../../admin/services/featureSettings.service.js';
import { buildPlanCatalog, resolveEligiblePlanByGmv, GST_RATE } from '../services/subscriptionPlan.service.js';

/**
 * GET /subscription/overview — current-month live GMV, estimated plan/fee,
 * outstanding dues, locked amount, wallet balance and withdrawable amount.
 */
export const getSubscriptionOverviewController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const featureEnabled = await isFeatureEnabled(FEATURE_KEYS.RESTAURANT_SUBSCRIPTION, true);

        const currentMonth = formatBillingMonth(new Date());
        const { start, end } = getMonthWindow(currentMonth);
        const [gmvResult, settings, outstanding, finance] = await Promise.all([
            computeMonthlyGmv(restaurantId, start, new Date()),
            getRestaurantSubscriptionSettings(),
            getOutstandingSummary(restaurantId),
            getRestaurantFinance(restaurantId),
        ]);

        const catalog = buildPlanCatalog(settings || {});
        const estimatedPlan = resolveEligiblePlanByGmv(gmvResult.gmv, catalog);
        const planEntry = catalog.plans.find((plan) => plan.id === estimatedPlan) || catalog.plans[0];
        const estimatedPlanAmount = gmvResult.gmv > 0 ? Math.max(0, Number(planEntry?.basePrice) || 0) : 0;
        const estimatedGst = Math.round(estimatedPlanAmount * GST_RATE);

        return sendResponse(res, 200, 'Subscription overview fetched', {
            featureEnabled,
            currentMonth: {
                billingMonth: currentMonth,
                label: billingMonthLabel(currentMonth),
                periodStart: start,
                periodEnd: end,
                gmv: gmvResult.gmv,
                orderCount: gmvResult.orderCount,
                estimatedPlan: gmvResult.gmv > 0 ? estimatedPlan : null,
                estimatedPlanLabel: gmvResult.gmv > 0 ? planEntry?.label || estimatedPlan : null,
                estimatedPlanAmount,
                estimatedGst,
                estimatedTotal: estimatedPlanAmount + estimatedGst,
                planCatalog: catalog.plans,
            },
            outstanding: {
                totalDue: outstanding.lockedAmount,
                lockedAmount: featureEnabled ? outstanding.lockedAmount : 0,
                lockedMonths: outstanding.monthsLabel,
                openInvoices: outstanding.openInvoices,
            },
            wallet: {
                totalBalance: Number(finance?.wallet?.withdrawableBalance ?? finance?.currentCycle?.withdrawableBalance ?? 0),
                netAvailable: Number(finance?.wallet?.netAvailable ?? finance?.currentCycle?.netAvailable ?? 0),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /subscription/invoices — the restaurant's monthly invoice history.
 */
export const listSubscriptionInvoicesController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

        const filter = { restaurantId: new mongoose.Types.ObjectId(String(restaurantId)) };
        if (req.query.status) filter.status = String(req.query.status);

        const [invoices, total] = await Promise.all([
            FoodSubscriptionInvoice.find(filter)
                .sort({ billingMonth: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            FoodSubscriptionInvoice.countDocuments(filter),
        ]);

        return sendResponse(res, 200, 'Subscription invoices fetched', {
            invoices: invoices.map((inv) => ({ ...inv, billingMonthLabel: billingMonthLabel(inv.billingMonth) })),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /subscription/invoices/:invoiceId — one invoice + its transaction timeline.
 */
export const getSubscriptionInvoiceController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        const { invoiceId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(String(invoiceId))) {
            return sendError(res, 400, 'Invalid invoice id');
        }

        const invoice = await FoodSubscriptionInvoice.findOne({
            _id: invoiceId,
            restaurantId: new mongoose.Types.ObjectId(String(restaurantId)),
        }).lean();
        if (!invoice) return sendError(res, 404, 'Invoice not found');

        const transactions = await FoodSubscriptionTransaction.find({ invoiceId: invoice._id })
            .sort({ createdAt: 1 })
            .lean();

        return sendResponse(res, 200, 'Subscription invoice fetched', {
            invoice: { ...invoice, billingMonthLabel: billingMonthLabel(invoice.billingMonth) },
            transactions,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /subscription/transactions — complete billing timeline for the restaurant.
 */
export const listSubscriptionTransactionsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

        const filter = { restaurantId: new mongoose.Types.ObjectId(String(restaurantId)) };
        if (req.query.billingMonth) filter.billingMonth = String(req.query.billingMonth);

        const [transactions, total] = await Promise.all([
            FoodSubscriptionTransaction.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            FoodSubscriptionTransaction.countDocuments(filter),
        ]);

        return sendResponse(res, 200, 'Subscription transactions fetched', {
            transactions: transactions.map((tx) => ({
                ...tx,
                billingMonthLabel: billingMonthLabel(tx.billingMonth),
            })),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (error) {
        next(error);
    }
};
