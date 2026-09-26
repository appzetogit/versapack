import crypto from 'crypto';

let Razorpay;
try {
    const mod = await import('razorpay');
    Razorpay = mod.default;
} catch {
    Razorpay = null;
}

import { config } from '../../../../config/env.js';

const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';

export function isRazorpayConfigured() {
    return Boolean(KEY_ID && KEY_SECRET && Razorpay);
}

export function getRazorpayKeyId() {
    return KEY_ID;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

/**
 * The Razorpay Node SDK does not throw Error instances on an API failure. It
 * throws a plain object -- `{ statusCode, error: { code, description, ... } }`
 * -- with no `.message` at all (see node_modules/razorpay/dist/api.js,
 * normalizeError). Express's error handler does `err.message || 'Server
 * Error'`, so every rejection from Razorpay -- wrong key/secret, a disabled
 * account, an amount below its minimum, anything -- reached the client as a
 * bare "Server Error" carrying whatever HTTP status Razorpay itself used.  A
 * wallet top-up failing on bad Razorpay credentials came back as 401, which
 * from a mobile client is indistinguishable from the user's own session
 * having expired, and pointed debugging at the wrong end of the system
 * entirely.
 *
 * Wraps a Razorpay SDK call so what propagates is a real Error: `.message` is
 * Razorpay's own description, `.statusCode` is preserved for the client (a
 * card decline should still surface as 4xx, not 500), and `.razorpayError` +
 * `.isRazorpayError` are attached for anyone logging or branching on it.
 */
async function callRazorpay(fn) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof Error) {
            if (err.statusCode === 401) {
                err.statusCode = 502;
                err.message = `Razorpay API authentication failed (check RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET): ${err.message}`;
            }
            throw err;
        }
        const detail = err?.error || {};
        const message = detail.description || detail.reason || detail.code || err?.message || 'Razorpay request failed';
        let statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 502;
        
        if (statusCode === 401) {
            statusCode = 502; // Map Razorpay server credential failure away from 401 so Flutter clients don't mistake it for user JWT expiration
        }

        const wrappedMessage = statusCode === 502 && err?.statusCode === 401
            ? `Payment gateway authentication failed (check RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET): ${message}`
            : message;

        const wrapped = new Error(wrappedMessage);
        wrapped.statusCode = statusCode;
        wrapped.isRazorpayError = true;
        wrapped.razorpayError = detail;
        throw wrapped;
    }
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '') {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return callRazorpay(() => instance.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt || undefined
    }));
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, customerName, customerEmail, customerPhone }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return callRazorpay(() => instance.paymentLink.create({
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        customer: {
            name: customerName || 'Customer',
            email: customerEmail || 'customer@example.com',
            contact: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999'
        }
    }));
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!KEY_SECRET) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    return expected === signature;
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return callRazorpay(() => instance.payments.fetch(String(paymentId)));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return callRazorpay(() => instance.paymentLink.fetch(String(paymentLinkId)));
}

/**
 * ✅ NEW: Initiate a refund for a successful payment.
 * NON-BREAKING Extension for automated cancellation refunds.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured on this server');
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        // Log locally but pass the error to the service to handle status update
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}
