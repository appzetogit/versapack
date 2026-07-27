import mongoose from 'mongoose';
import { FoodChatMessage } from '../models/chatMessage.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { ValidationError, ForbiddenError } from '../../../../core/auth/errors.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { notifyOwnersSafely } from '../../orders/services/order.helpers.js';
import { notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

const ROLES = ['USER', 'RESTAURANT', 'DELIVERY_PARTNER', 'ADMIN'];

/** Stable identifier for a participant. ADMIN carries no id (shared inbox). */
export const partyToken = (role, id) => (role === 'ADMIN' ? 'ADMIN' : `${role}:${String(id)}`);

/** Deterministic conversation id — same two parties (+ order) always collide to one thread. */
const buildConversationId = (tokenA, tokenB, orderId) => {
    const scope = orderId ? String(orderId) : 'direct';
    return `${scope}::${[tokenA, tokenB].sort().join('|')}`;
};

/** Socket room a party listens on. */
const roomForToken = (role, id) => {
    if (role === 'ADMIN') return rooms.admin();
    if (role === 'USER') return rooms.user(id);
    if (role === 'RESTAURANT') return rooms.restaurant(id);
    if (role === 'DELIVERY_PARTNER') return rooms.delivery(id);
    return null;
};

/** Both non-admin parties must actually belong to the order they're chatting about. */
async function assertOrderParticipants(orderId, tokens) {
    if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
        throw new ValidationError('Invalid order id');
    }
    const order = await FoodOrder.findById(orderId)
        .select('userId restaurantId dispatch.deliveryPartnerId')
        .lean();
    if (!order) throw new ValidationError('Order not found');

    const orderTokens = new Set(
        [
            order.userId && partyToken('USER', order.userId),
            order.restaurantId && partyToken('RESTAURANT', order.restaurantId),
            order.dispatch?.deliveryPartnerId &&
                partyToken('DELIVERY_PARTNER', order.dispatch.deliveryPartnerId)
        ].filter(Boolean)
    );

    for (const t of tokens) {
        if (t === 'ADMIN') continue; // admin may join any order thread
        if (!orderTokens.has(t)) {
            throw new ForbiddenError('You are not a participant of this order');
        }
    }
}

/**
 * Persist a message, deliver it live over sockets, and push to the recipient.
 * @param sender {{ role, id }}
 * @param dto {{ peerRole, peerId?, orderId?, text }}
 */
/**
 * Work out who the message is for, from the ORDER — never from a client-supplied peerId,
 * which a caller could point at an unrelated user.
 *
 * With only { orderId, text } the counterpart is implied: a customer is writing to the
 * assigned rider and vice versa. peerRole is honoured when supplied so a restaurant can
 * pick which side of the order it is addressing.
 */
async function resolveOrderRecipient(sender, order, requestedPeerRole = '') {
    const userId = order?.userId ? String(order.userId) : '';
    const riderId = order?.dispatch?.deliveryPartnerId ? String(order.dispatch.deliveryPartnerId) : '';
    const restaurantId = order?.restaurantId ? String(order.restaurantId) : '';
    const me = String(sender.id);

    const parties = {
        USER: userId,
        DELIVERY_PARTNER: riderId,
        RESTAURANT: restaurantId
    };

    // The sender must actually be on this order.
    if (String(parties[sender.role] || '') !== me) {
        throw new ForbiddenError('You are not a participant of this order');
    }

    if (requestedPeerRole) {
        const role = String(requestedPeerRole).toUpperCase();
        if (!parties[role]) {
            throw new ValidationError(
                role === 'DELIVERY_PARTNER'
                    ? 'No delivery partner is assigned to this order yet'
                    : `This order has no ${role.toLowerCase()} to message`
            );
        }
        if (role === sender.role) throw new ValidationError('Cannot message yourself');
        return { role, id: parties[role] };
    }

    // Default counterpart: customer <-> assigned rider.
    if (sender.role === 'USER') {
        if (!riderId) throw new ValidationError('No delivery partner is assigned to this order yet');
        return { role: 'DELIVERY_PARTNER', id: riderId };
    }
    if (sender.role === 'DELIVERY_PARTNER') {
        if (!userId) throw new ValidationError('This order has no customer to message');
        return { role: 'USER', id: userId };
    }
    // A restaurant has two possible counterparts, so it must say which.
    throw new ValidationError('peerRole is required for this sender');
}

/** True for the customer<->rider pair, whose thread is keyed on the order id itself. */
const isUserRiderPair = (roleA, roleB) =>
    [roleA, roleB].sort().join('|') === 'DELIVERY_PARTNER|USER';

export async function sendMessage(sender, dto) {
    const text = String(dto?.text || '').trim();
    if (!text) throw new ValidationError('Message text is required');
    if (text.length > 2000) throw new ValidationError('Message is too long (max 2000 chars)');

    const requestedPeerRole = String(dto?.peerRole || '').toUpperCase();
    if (requestedPeerRole && !ROLES.includes(requestedPeerRole)) {
        throw new ValidationError('Invalid peerRole');
    }

    const orderIdRaw = dto?.orderId ? String(dto.orderId) : '';
    const adminInvolved = sender.role === 'ADMIN' || requestedPeerRole === 'ADMIN';

    // Non-admin conversations must be tied to a shared order (anti-spam).
    if (!adminInvolved && !orderIdRaw) {
        throw new ValidationError('orderId is required to chat outside of admin support');
    }

    let orderId = null;
    let peerRole;
    let peerId;

    if (orderIdRaw && !adminInvolved) {
        if (!mongoose.Types.ObjectId.isValid(orderIdRaw)) {
            throw new ValidationError('Invalid order id');
        }
        const order = await FoodOrder.findById(orderIdRaw)
            .select('userId restaurantId dispatch.deliveryPartnerId')
            .lean();
        if (!order) throw new ValidationError('Order not found');

        orderId = order._id;
        const peer = await resolveOrderRecipient(sender, order, requestedPeerRole);
        peerRole = peer.role;
        peerId = peer.id;
    } else {
        // Admin support thread: no order, so the peer must be stated.
        peerRole = requestedPeerRole || 'ADMIN';
        if (peerRole !== 'ADMIN') {
            if (!mongoose.Types.ObjectId.isValid(String(dto?.peerId || ''))) {
                throw new ValidationError('peerId is required for non-admin recipients');
            }
            peerId = String(dto.peerId);
        }
        if (orderIdRaw && mongoose.Types.ObjectId.isValid(orderIdRaw)) {
            orderId = new mongoose.Types.ObjectId(orderIdRaw);
        }
    }

    const senderToken = partyToken(sender.role, sender.id);
    const recipientToken = partyToken(peerRole, peerId);

    // Customer <-> rider threads are keyed on the order's Mongo _id exactly, because the
    // client looks the thread up by the order id it already holds.
    const conversationId =
        orderId && isUserRiderPair(sender.role, peerRole)
            ? String(orderId)
            : buildConversationId(senderToken, recipientToken, orderId);

    const message = await FoodChatMessage.create({
        conversationId,
        orderId,
        senderRole: sender.role,
        senderId: new mongoose.Types.ObjectId(String(sender.id)),
        senderToken,
        recipientRole: peerRole,
        recipientId: peerRole === 'ADMIN' ? null : new mongoose.Types.ObjectId(String(peerId)),
        recipientToken,
        participants: [senderToken, recipientToken],
        text
    });

    const payload = serializeMessage(message);

    // Live delivery — emit to the recipient's room and echo to the sender's own other devices.
    try {
        const io = getIO();
        if (io) {
            const recipientRoom = roomForToken(peerRole, peerId);
            const senderRoom = roomForToken(sender.role, sender.id);
            if (recipientRoom) io.to(recipientRoom).emit('chat:message', payload);
            if (senderRoom && senderRoom !== recipientRoom) io.to(senderRoom).emit('chat:message', payload);
        }
    } catch (err) {
        logger.warn(`chat socket emit failed: ${err?.message || err}`);
    }

    // Push to the recipient (FCM handles foreground suppression on-device).
    const pushPayload = {
        title: chatTitle(sender.role),
        body: text.slice(0, 120),
        data: { type: 'chat_message', conversationId, orderId: orderId ? String(orderId) : '' }
    };
    if (peerRole === 'ADMIN') {
        notifyAdminsSafely(pushPayload).catch(() => {});
    } else {
        notifyOwnersSafely([{ ownerType: peerRole, ownerId: peerId }], pushPayload).catch(() => {});
    }

    return payload;
}

const chatTitle = (senderRole) => {
    if (senderRole === 'USER') return 'New message from customer';
    if (senderRole === 'RESTAURANT') return 'New message from restaurant';
    if (senderRole === 'DELIVERY_PARTNER') return 'New message from delivery partner';
    if (senderRole === 'ADMIN') return 'New message from support';
    return 'New message';
};

export function serializeMessage(doc) {
    const m = doc?.toObject ? doc.toObject() : doc;
    return {
        id: String(m._id),
        conversationId: m.conversationId,
        orderId: m.orderId ? String(m.orderId) : null,
        senderRole: m.senderRole,
        senderId: String(m.senderId),
        recipientRole: m.recipientRole,
        recipientId: m.recipientId ? String(m.recipientId) : null,
        text: m.text,
        readAt: m.readAt || null,
        createdAt: m.createdAt
    };
}

/** History for one conversation. Marks messages TO me as read as a side effect. */
export async function getHistory(me, { conversationId, page = 1, limit = 30 }) {
    if (!conversationId) throw new ValidationError('conversationId is required');
    const myToken = partyToken(me.role, me.id);

    const first = await FoodChatMessage.findOne({ conversationId }).select('participants').lean();
    if (!first) return { messages: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    if (!first.participants.includes(myToken)) {
        throw new ForbiddenError('Not your conversation');
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

    const [docs, total] = await Promise.all([
        FoodChatMessage.find({ conversationId }).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
        FoodChatMessage.countDocuments({ conversationId })
    ]);

    await markRead(me, conversationId);

    return {
        messages: docs.map(serializeMessage).reverse(), // oldest → newest for UI
        pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) }
    };
}

/** Mark every message sent TO me in this conversation as read. */
export async function markRead(me, conversationId) {
    const myToken = partyToken(me.role, me.id);
    const res = await FoodChatMessage.updateMany(
        { conversationId, recipientToken: myToken, readAt: null },
        { $set: { readAt: new Date() } }
    );
    return { updated: res.modifiedCount || 0 };
}

/** All conversations I'm a party to, newest activity first, with unread counts. */
export async function listConversations(me) {
    const myToken = partyToken(me.role, me.id);
    const rows = await FoodChatMessage.aggregate([
        { $match: { participants: myToken } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: '$conversationId',
                orderId: { $first: '$orderId' },
                lastText: { $first: '$text' },
                lastAt: { $first: '$createdAt' },
                lastSenderToken: { $first: '$senderToken' },
                participants: { $first: '$participants' },
                unread: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$recipientToken', myToken] }, { $eq: ['$readAt', null] }] },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        { $sort: { lastAt: -1 } }
    ]);

    return {
        conversations: rows.map((r) => ({
            conversationId: r._id,
            orderId: r.orderId ? String(r.orderId) : null,
            peerToken: (r.participants || []).find((t) => t !== myToken) || null,
            lastMessage: r.lastText,
            lastAt: r.lastAt,
            unread: r.unread
        }))
    };
}
