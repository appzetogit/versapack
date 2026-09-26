import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        ownerType: {
            type: String,
            enum: ['USER', 'RESTAURANT', 'DELIVERY_PARTNER'],
            required: true,
            index: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: '',
            trim: true
        },
        category: {
            type: String,
            default: 'broadcast',
            trim: true
        },
        source: {
            type: String,
            // SUBSCRIPTION_BILLING was missing, so every billing notification
            // failed validation and was thrown away: sellers were invoiced and
            // never told. The invoice itself saved regardless, which is why this
            // went unnoticed — only a warning in the log marked it.
            enum: ['ADMIN_BROADCAST', 'FSSAI_EXPIRY', 'SUPPORT_RESPONSE', 'SUBSCRIPTION_BILLING', 'ORDER_EVENT'],
            default: 'ADMIN_BROADCAST',
            index: true
        },
        // No `default: null` here on purpose. A sparse index treats an explicit
        // null as present, so with a default every non-broadcast notification
        // (FSSAI expiry, support response, subscription billing) got the SAME
        // {broadcastId: null, ownerType, ownerId} index key -- the second such
        // notification a restaurant or user ever received, of ANY kind, hit the
        // unique constraint below and was dropped silently: every write site
        // wraps this in a catch that only logs. Leaving the field genuinely
        // absent when it is not a broadcast is what lets the sparse index skip
        // it, which is what the "one row per broadcast recipient" index was
        // actually meant to enforce.
        broadcastId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BroadcastNotification',
            index: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true
        },
        readAt: {
            type: Date,
            default: null
        },
        dismissedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    {
        collection: 'food_notifications',
        timestamps: true
    }
);

notificationSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
notificationSchema.index({ ownerType: 1, ownerId: 1, isRead: 1, dismissedAt: 1 });
// A partial index, not a sparse one: `sparse` on a COMPOUND index only skips a
// document when ALL of its keys are absent, and ownerType/ownerId are required
// on every notification -- so `sparse` here never excluded anything, and every
// non-broadcast notification (FSSAI expiry, support response, subscription
// billing) got indexed as {broadcastId: null, ownerType, ownerId}, colliding
// with the very next one for the same owner. That second notification, of any
// kind, was then silently dropped -- every write site catches and only logs.
// A partial index filtered on the field actually existing is what "one row per
// broadcast recipient" needed, and does not touch documents with no broadcastId
// at all.
notificationSchema.index(
    { broadcastId: 1, ownerType: 1, ownerId: 1 },
    { unique: true, partialFilterExpression: { broadcastId: { $exists: true } } }
);
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const FoodNotification = mongoose.model('FoodNotification', notificationSchema);
