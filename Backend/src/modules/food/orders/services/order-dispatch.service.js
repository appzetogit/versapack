import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from '../../delivery/models/deliveryWallet.model.js';
import { FoodDeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { config } from '../../../../config/env.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  getBusyDeliveryPartnerIds,
  haversineKm,
  notifyOwnerSafely,
  notifyOwnersActionableAlert,
  notifyOwnersSafely,
} from './order.helpers.js';
import { fetchDrivingRoute } from '../utils/googleMaps.js';
import { parseGeoPoint } from '../../shared/geo.utils.js';

/**
 * Resolve restaurant â†’ customer road distance once per dispatch broadcast.
 * Falls back to pricing Haversine when Directions is unavailable.
 */
async function enrichPayloadWithTripRoadDistance(order, payload) {
  const existingRoadKm = order?.tripDistanceKm ?? order?.pricing?.roadDistanceKm;
  if (Number.isFinite(Number(existingRoadKm))) {
    const km = Number(Number(existingRoadKm).toFixed(2));
    const minsRaw = order?.tripDurationMins ?? order?.pricing?.roadDurationMins;
    const tripDurationMins = Number.isFinite(Number(minsRaw))
      ? Math.ceil(Number(minsRaw))
      : payload.tripDurationMins;
    return {
      ...payload,
      tripDistanceKm: km,
      tripDurationMins: tripDurationMins ?? null,
      distanceKm: km,
    };
  }

  const restaurantPoint =
    parseGeoPoint(order?.restaurantId) ||
    parseGeoPoint(order?.restaurantId?.location);
  const customerPoint = parseGeoPoint(order?.deliveryAddress);

  if (!restaurantPoint || !customerPoint) {
    return payload;
  }

  try {
    const route = await fetchDrivingRoute(restaurantPoint, customerPoint);
    if (route.distanceKm != null) {
      const tripDurationMins =
        route.durationSeconds != null
          ? Math.ceil(route.durationSeconds / 60)
          : null;

      // Persist so subsequent offers / reconnects reuse road distance.
      if (order?._id) {
        FoodOrder.updateOne(
          { _id: order._id },
          {
            $set: {
              tripDistanceKm: route.distanceKm,
              tripDurationMins,
              'pricing.roadDistanceKm': route.distanceKm,
              'pricing.roadDurationMins': tripDurationMins,
            },
          },
        ).catch(() => {});
      }

      return {
        ...payload,
        tripDistanceKm: route.distanceKm,
        tripDurationMins,
        distanceKm: route.distanceKm,
      };
    }
  } catch (err) {
    logger.warn(`Trip road distance enrichment failed: ${err?.message || err}`);
  }

  return payload;
}

/**
 * Driver acceptance window. Single source of truth â€” the client countdown, the re-queue
 * delay and acceptanceDeadlineAt all derive from this, so they can't drift apart.
 */
const DRIVER_ACCEPT_WINDOW_MS = 45000;

/**
 * Flat, string-only data map for the incoming-order push.
 *
 * FCM data values must be strings. Everything the full-screen alert needs is included so
 * the app can render it with no follow-up API call â€” important when the device is locked
 * or the app was killed.
 */
/** FCM data values must be strings; null/undefined become '' rather than "null". */
const s = (v) => (v === undefined || v === null ? '' : String(v));

// Exported so the payload can be inspected against a real order without
// dispatching one; nothing outside this module calls it in production.
export function buildIncomingOrderPushData(order, payload, acceptanceDeadlineAt) {
  const earning = s(payload?.riderEarning ?? 0);
  const distance = s(payload?.tripDistanceKm ?? '');
  const bodyLines = [
    payload?.restaurantName ? `Pickup: ${s(payload.restaurantName)}` : '',
    payload?.customerAddress ? `Drop: ${s(payload.customerAddress)}` : '',
    distance ? `${distance} km` : '',
    `Earning: Rs.${earning}`,
  ].filter(Boolean);

  return {
    type: 'new_order',
    // Carried INSIDE data on purpose.
    //
    // This push is data-only, so FCM omits the notification block and
    // message.notification is null on the device. An app reading
    // message.notification.title therefore renders a blank notification â€” which
    // reads as a broken push rather than a missing field. The restaurant app hit
    // exactly this. These give the rider app ready-made strings straight from
    // message.data.
    title: 'New order available!',
    body: bodyLines.join('\n'),
    orderId: s(order?._id),
    orderMongoId: s(order?._id),
    orderDisplayId: s(order?.order_id || order?._id),
    restaurantName: s(payload?.restaurantName),
    restaurantAddress: s(payload?.restaurantAddress),
    customerAddress: s(payload?.customerAddress),
    tripDistanceKm: s(payload?.tripDistanceKm ?? ''),
    tripDurationMins: s(payload?.tripDurationMins ?? ''),
    riderEarning: s(payload?.riderEarning ?? 0),
    earnings: s(payload?.earnings ?? payload?.riderEarning ?? 0),
    paymentMethod: s(payload?.paymentMethod || order?.payment?.method),
    total: s(payload?.total ?? order?.pricing?.total ?? 0),
    acceptanceDeadlineAt: s(acceptanceDeadlineAt?.toISOString?.() || acceptanceDeadlineAt),
    // The offer window, so the client countdown is driven by the server rather
    // than a constant compiled into the app.
    //
    // The absolute deadline above is the more accurate of the two — it cannot
    // drift with delivery latency — but a message delayed in Doze arrives with
    // an already-expired deadline, and a card that opens at 0 seconds is worse
    // than one that opens short. Sending both lets the app prefer the deadline
    // and fall back to this when the deadline is already in the past.
    acceptTimeoutSeconds: s(Math.round(DRIVER_ACCEPT_WINDOW_MS / 1000)),
    pickupAddress: s(payload?.restaurantAddress),
    dropAddress: s(payload?.customerAddress),
    price: s(payload?.earnings ?? payload?.riderEarning ?? 0),
    distance: s(payload?.tripDistanceKm ?? ''),

    // Everything below exists so the alert can be drawn with ZERO network
    // calls.
    //
    // The background isolate that renders this alert often runs while the
    // device is in Doze or the app has just been woken to handle the push —
    // conditions where an HTTP request is deferred or refused outright. An
    // alert that has to fetch anything is an alert that sometimes never
    // appears, and the rider is given 45 seconds to decide.
    //
    // The coordinates in particular let the app draw the pickup/drop pins and
    // a straight-line preview before the app is even opened.
    orderNumber: s(order?.order_id || ''),
    restaurantImage: s(payload?.restaurantCoverImage || ''),
    pickupLat: s(payload?.restaurantLocation?.latitude ?? ''),
    pickupLng: s(payload?.restaurantLocation?.longitude ?? ''),
    dropLat: s(payload?.customerLocation?.latitude ?? ''),
    dropLng: s(payload?.customerLocation?.longitude ?? ''),
    customerName: s(payload?.customerName || order?.customerName || ''),
    customerPhone: s(payload?.customerPhone || order?.customerPhone || ''),
    itemsCount: s(Array.isArray(order?.items) ? order.items.length : ''),
    // paymentMethod alone cannot distinguish a prepaid order that is paid from
    // one still awaiting payment, so the card had to assume. Sending the status
    // makes the chip say what is actually true.
    paymentStatus: s(payload?.paymentStatus || order?.payment?.status || ''),
    items: buildPushItems(order?.items),
  };
}

/**
 * Product thumbnails for the alert card, as a JSON string.
 *
 * FCM data values must be strings and the whole map has a hard 4 KB ceiling, so
 * this is the one field that has to be actively kept small:
 *
 *  - Capped at 4 entries. The card draws 3 and derives its "+N" pill from
 *    `itemsCount`, which stays the true total -- so trimming here never changes
 *    the number the rider sees.
 *  - Only name/quantity/image. Nothing else is rendered, and image URLs are
 *    already the largest thing on the wire.
 *  - If it still exceeds 1 KB the images are dropped and names sent alone,
 *    rather than truncating the string into JSON the app cannot parse. A card
 *    with no thumbnails degrades; a card with broken JSON does not render.
 */
function buildPushItems(items) {
  const list = Array.isArray(items) ? items.slice(0, 4) : [];
  if (list.length === 0) return '[]';

  const withImages = list.map((i) => ({
    name: String(i?.name || ''),
    quantity: Number(i?.quantity || 1),
    image: String(i?.image || ''),
  }));

  const encoded = JSON.stringify(withImages);
  if (Buffer.byteLength(encoded, 'utf8') <= 1024) return encoded;

  return JSON.stringify(withImages.map(({ image, ...rest }) => rest));
}

/**
 * Riders who are already holding as much cash as they are allowed to.
 *
 * The limit existed as an admin setting and was shown to riders in their wallet, but
 * nothing enforced it: an over-limit rider kept being offered cash orders and could
 * keep accepting them, so the cap was advisory only.
 *
 * Only applied to orders the rider will physically collect money for. A prepaid
 * order adds nothing to their float, so blocking those would idle riders for no
 * reason.
 *
 * A limit of 0 means "no limit" â€” that is the schema default, so an install that has
 * never configured this must not have every rider silently excluded.
 *
 * @returns {Promise<Set<string>>} partner ids to skip
 */
async function getCashBlockedPartnerIds(partnerIds) {
  if (!partnerIds.length) return new Set();

  const settings = await FoodDeliveryCashLimit.findOne({ isActive: true })
    .select('deliveryCashLimit')
    .lean();
  const limit = Number(settings?.deliveryCashLimit) || 0;
  if (limit <= 0) return new Set();

  const wallets = await FoodDeliveryWallet.find({
    deliveryPartnerId: { $in: partnerIds },
    cashInHand: { $gte: limit },
  })
    .select('deliveryPartnerId cashInHand')
    .lean();

  return new Set(wallets.map((w) => String(w.deliveryPartnerId)));
}

/** Cash the rider has to physically collect, so it counts against their float. */
function orderCollectsCash(order) {
  const method = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase();
  return method === 'cash' || method === 'razorpay_qr';
}

async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  { maxKm = 15, limit = 25 } = {},
) {
  const rId = (restaurantId?._id || restaurantId).toString();
  const restaurant = await FoodRestaurant.findById(rId)
    .select("location")
    .lean();

  if (!restaurant?.location?.coordinates?.length) {
    // Without restaurant coords we cannot safely match riders by zone/proximity.
    return { restaurant: null, partners: [] };
  }

  const [rLng, rLat] = restaurant.location.coordinates;
  const allOnline = await FoodDeliveryPartner.find({
    availabilityStatus: "online",
  })
    .select("_id status lastLat lastLng lastLocationAt name")
    .lean();

  const scored = [];
  const allowedStatuses = process.env.NODE_ENV === 'production' ? ['approved'] : ['approved', 'pending'];

  // A rider is only dropped for staleness after this long WITHOUT any GPS ping.
  //
  // This was 10 minutes, which silently starved the whole offer path: Android Doze
  // suppresses the app's background location upload, the rider's GPS goes stale, so
  // they're excluded from the offer, so no push is sent to wake the app, so the GPS
  // stays stale. A rider sitting outside the restaurant with the app backgrounded
  // would never be told about a new order.
  //
  // Excluding them was never what stopped cross-city offers â€” the distanceKm <= maxKm
  // gate below does that. The original bug was that missing-GPS riders were being
  // scored as distanceKm: 999, which BYPASSED the gate. Coordinates that are half an
  // hour old and 3 km from the restaurant are still a far better candidate than
  // offering the order to nobody.
  const STALE_GPS_MS = Number(process.env.DISPATCH_STALE_GPS_MS) || 45 * 60 * 1000;

  let droppedStale = 0;
  for (const p of allOnline) {
    if (!allowedStatuses.includes(p.status)) continue;

    // No coordinates at all â†’ genuinely unplaceable, must skip (never score as 999).
    if (p.lastLat == null || p.lastLng == null) {
      droppedStale += 1;
      continue;
    }
    if (!p.lastLocationAt || Date.now() - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS) {
      droppedStale += 1;
      continue;
    }

    const d = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
    if (Number.isFinite(d) && d <= maxKm) {
      scored.push({ partnerId: p._id, distanceKm: d, status: p.status });
    }
  }

  // Without this, a starved dispatch is indistinguishable from "no riders online".
  if (droppedStale > 0) {
    logger.warn(
      `[Dispatch] ${droppedStale}/${allOnline.length} online riders skipped for missing/stale GPS ` +
        `(restaurant ${rId}, maxKm ${maxKm}). ${scored.length} eligible.`,
    );
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  if (picked.length === 0) {
    // Do NOT fall back to any online partner worldwide (cross-zone bug).
    // Caller will retry later when nearby GPS updates.
    return { partners: [] };
  }

  const final = (config.nodeEnv === 'production')
    ? picked.filter(p => p.status === 'approved')
    : picked;

  return { partners: final };
}

export async function getDispatchSettings() {
  return { dispatchMode: "auto" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  // Always set to auto
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode: "auto",
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

export async function tryAutoAssign(orderId, options = {}) {
  const attempt = options.attempt || 1;
  // Small buffer above the accept window so an in-flight offer isn't reclaimed early.
  const lockTimeout = DRIVER_ACCEPT_WINDOW_MS + 5000; // 50s

  const order = await FoodOrder.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      $or: [
        { 'dispatch.status': 'unassigned' },
        {
          'dispatch.status': 'assigned',
          'dispatch.acceptedAt': { $exists: false },
          'dispatch.assignedAt': { $lt: new Date(Date.now() - lockTimeout) }
        }
      ],
      'dispatch.dispatchingAt': { $exists: false }
    },
    {
      $set: { 'dispatch.dispatchingAt': new Date() }
    },
    { new: true }
  ).populate(['restaurantId', 'userId']);

  if (!order) {
    logger.info(`tryAutoAssign: Skip for ${orderId} (already dispatching, accepted, or multi-attempt lock active).`);
    return null;
  }

  // Decoupling: Ensure order is accepted by restaurant before dispatching to delivery boys
  const DISPATCHABLE_STATUSES = ['confirmed', 'preparing', 'ready_for_pickup', 'ready', 'reached_pickup', 'picked_up', 'reached_drop'];
  if (!DISPATCHABLE_STATUSES.includes(order.orderStatus)) {
    logger.info(`tryAutoAssign: Skip for ${orderId} (status ${order.orderStatus} not dispatchable yet).`);
    return order;
  }

  try {
    const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());
    const permanentlyExcludedIds = new Set(
      (order.dispatch?.offeredTo || [])
        .filter((offer) => offer.action === 'deassigned')
        .map((offer) => offer.partnerId.toString())
    );
    
    // RADIUS EXPANSION LOGIC
    //
    // Bands are much tighter than the food-delivery ones they replace (15 → 25
    // → 40 → 60 km). A rider 40 km from the seller cannot serve a promise
    // measured in minutes: by the time they arrive the order is late whatever
    // happens next, and offering it to them mostly delays the escalation that
    // would have got it delivered. Expanding to a few km buys a real second
    // chance; expanding past that buys a worse outcome than admitting failure.
    //
    // Overridable without a deploy, because the honest radius depends on rider
    // density in a way only live data shows.
    const bands = String(process.env.DISPATCH_RADIUS_BANDS_KM || '3,5,8,12')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    const radiusBands = bands.length > 0 ? bands : [3, 5, 8, 12];
    const maxKm = radiusBands[Math.min(Math.max(attempt, 1), radiusBands.length) - 1];

    const searchOptions = { maxKm, limit: 15 };
    const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, searchOptions);
    const busyPartnerIds = await getBusyDeliveryPartnerIds();

    // TIERED ALERT LOGIC
    // Phase 2: Broadcast to all (Attempt 3+)
    // Phase 3: Admin Alert (Attempt 5+ or roughly 5 mins)
    const isPhase3 = attempt >= 6; // ~6 minutes (60s * 6)

    if (isPhase3) {
      logger.error(`[CRITICAL] Order ${order._id} unassigned for ${attempt} mins. Triggering Admin Alert (Phase 3).`);
      // Notify Admin via Push (Web/Mobile)
      try {
        await notifyOwnersSafely(
          [{ ownerType: 'ADMIN', ownerId: 'GLOBAL' }], // Use GLOBAL or specific admin group if defined
          {
            title: 'Unassigned Order Crisis!',
            body: `Order #${order.order_id || order._id} has not been picked up for 5+ minutes. Manual intervention required!`,
            data: { type: 'admin_alert_unassigned', orderId: order._id.toString() }
          }
        );
      } catch (err) {
        logger.warn(`Admin notification failed: ${err.message}`);
      }
    }

    // Riders at their cash ceiling are skipped for cash-collect orders only.
    const cashBlockedIds = orderCollectsCash(order)
      ? await getCashBlockedPartnerIds(partners.map((p) => p.partnerId))
      : new Set();

    const eligible = partners.filter((partner) => {
      const partnerKey = partner.partnerId.toString();
      if (offeredIds.includes(partnerKey)) return false;
      if (busyPartnerIds.has(partnerKey)) return false;
      if (cashBlockedIds.has(partnerKey)) return false;
      return true;
    });

    // Without this, a cash order finding nobody looks identical to no riders being
    // online, and the real reason â€” everyone is holding too much cash to deposit â€”
    // stays invisible.
    if (cashBlockedIds.size > 0) {
      logger.warn(
        `[Dispatch] ${cashBlockedIds.size} rider(s) skipped for order ${order._id}: ` +
          `cash-in-hand at or above the configured limit.`,
      );
    }

    if (eligible.length === 0) {
      logger.info(`tryAutoAssign: No NEW eligible partners in ${maxKm}km for order ${order._id}. Restarting hunt...`);
      
      // If we ran out of new eligible partners, we might want to re-offer to everyone (Phase 2 style)
      const io = getIO();
      const reofferEligible = partners.filter((partner) => {
        const partnerKey = partner.partnerId.toString();
        if (permanentlyExcludedIds.has(partnerKey)) return false;
        if (busyPartnerIds.has(partnerKey)) return false;
        return true;
      });
      if (reofferEligible.length > 0) {
        const basePayload = buildDeliverySocketPayload(order, order.restaurantId);
        const payload = await enrichPayloadWithTripRoadDistance(order, basePayload);
        const acceptanceDeadlineAt = new Date(Date.now() + DRIVER_ACCEPT_WINDOW_MS);

        if (io) {
          for (const p of reofferEligible) {
            const roomName = rooms.delivery(p.partnerId);
            io.to(roomName).emit('new_order_available', {
              ...payload,
              pickupDistanceKm: p.distanceKm,
              acceptanceDeadlineAt,
            });
          }
        }

        // This branch previously emitted a socket event only, so a backgrounded or locked
        // driver was never woken on a re-offer round â€” the order could sit unassigned while
        // every nearby rider was simply not looking at the app. Push on every round.
        try {
          // One call per partner, because pickupDistanceKm is rider-specific.
          // This costs nothing extra: sendNotificationToOwners already loops
          // over its targets sequentially, so a batched call was never one
          // request anyway.
          const basePush = buildIncomingOrderPushData(order, payload, acceptanceDeadlineAt);
          for (const p of reofferEligible) {
            await notifyOwnersActionableAlert(
              [{ ownerType: 'DELIVERY_PARTNER', ownerId: p.partnerId }],
              {
                title: 'New order available!',
                body: `Order #${order.order_id || order._id} is still available. Tap to accept.`,
                androidTag: `order_${order._id.toString()}`,
                androidChannelId: 'new_orders_v2',
                data: { ...basePush, pickupDistanceKm: s(p.distanceKm ?? '') },
              },
            );
          }
        } catch (err) {
          logger.warn(`Re-offer push failed for order ${order._id}: ${err.message}`);
        }
      }

      // Re-queue itself to keep trying, aligned to the client countdown.
      await addOrderJob({
        action: 'DISPATCH_TIMEOUT_CHECK',
        orderMongoId: order._id.toString(),
        orderId: order._id.toString(),
        attempt: attempt + 1
      }, { delay: DRIVER_ACCEPT_WINDOW_MS });

      return order;
    }

    const io = getIO();
    const basePayload = buildDeliverySocketPayload(order, order.restaurantId);
    const payload = await enrichPayloadWithTripRoadDistance(order, basePayload);

    // BROADCAST: Notify all eligible riders
    // tripDistanceKm = restaurant â†” customer (road); pickupDistanceKm = rider â†’ restaurant (ranking only)
    logger.info(`Broadcasting order ${order._id} to ${eligible.length} riders. tripDistanceKm=${payload.tripDistanceKm}`);
    const acceptanceDeadlineAt = new Date(Date.now() + DRIVER_ACCEPT_WINDOW_MS);
    for (const p of eligible) {
      const roomName = rooms.delivery(p.partnerId);
      if (io) {
        io.to(roomName).emit('new_order', {
          ...payload,
          pickupDistanceKm: p.distanceKm,
          acceptanceDeadlineAt,
        });
      }
    }

    if (eligible.length > 0) {
      try {
        // Sent per partner rather than as one batch, because pickupDistanceKm
        // is the rider's own distance to the store. No extra requests: the
        // fan-out inside sendNotificationToOwners was already a sequential loop
        // over targets.
        const basePush = buildIncomingOrderPushData(order, payload, acceptanceDeadlineAt);
        for (const p of eligible) {
          await notifyOwnersActionableAlert(
            [{ ownerType: 'DELIVERY_PARTNER', ownerId: p.partnerId }],
            {
              title: 'New order available!',
              body: `Order #${order.order_id || order._id} is available. You have ${Math.round(DRIVER_ACCEPT_WINDOW_MS / 1000)} seconds to accept!`,
              // Two messages â€” see notifyOwnersActionableAlert.
              //
              // This alert needs the app's own full-screen UI (which only a
              // data-only message can trigger) AND delivery on ROMs that refuse
              // to start the app (which only a notification block achieves).
              // Blending them into one message quietly lost the first: Android
              // renders a message that has a notification block and never calls
              // the handler that would have raised the overlay.
              //
              // The tag is the contract with the app (cancel(0, tag:) in
              // fcm_service.dart) â€” change one and you must change the other.
              androidTag: `order_${order._id.toString()}`,
              // Must match a channel the delivery app actually creates: Android
              // silently demotes an unknown channel id to low importance, which
              // on the device looks exactly like the push never arriving.
              androidChannelId: 'new_orders_v2',
              data: { ...basePush, pickupDistanceKm: s(p.distanceKm ?? '') },
            }
          );
        }
      } catch (err) {
        logger.warn(`Push notifications failed for broadcast on order ${order._id}: ${err.message}`);
      }
    }

    const offeredToEntries = eligible.map(p => ({
      partnerId: p.partnerId,
      at: new Date(),
      action: 'offered'
    }));

    // Conditional update, NOT order.save(). This doc was loaded before several awaits
    // (rider lookup, Directions fetch, FCM batch) â€” seconds of wall time during which a
    // rider may have accepted. A blind save reverted that accept to unassigned/null, so
    // the order was re-broadcast and a second rider could claim the same trip.
    const reoffer = await FoodOrder.updateOne(
      {
        _id: order._id,
        'dispatch.status': { $ne: 'accepted' },
        'dispatch.acceptedAt': { $exists: false },
      },
      {
        $set: { 'dispatch.status': 'unassigned', 'dispatch.deliveryPartnerId': null },
        $push: { 'dispatch.offeredTo': { $each: offeredToEntries } },
      },
    );

    if (reoffer.modifiedCount === 0) {
      logger.info(
        `tryAutoAssign: order ${order._id} was accepted during broadcast â€” leaving assignment intact.`,
      );
      return order;
    }

    // Re-check when the offer window closes, so the next round starts exactly as the
    // client countdown hits zero.
    await addOrderJob({
      action: 'DISPATCH_TIMEOUT_CHECK',
      orderMongoId: order._id.toString(),
      orderId: order._id.toString(),
      attempt: attempt + 1
    }, { delay: DRIVER_ACCEPT_WINDOW_MS });

    return order;
  } finally {
    await FoodOrder.findByIdAndUpdate(orderId, {
      $unset: { 'dispatch.dispatchingAt': '' },
    });
  }
}


export async function processDispatchTimeout(orderId, partnerId) {
  const order = await FoodOrder.findById(orderId);
  if (!order) return;

  const stillAssigned = order.dispatch?.status === 'assigned' &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(`Dispatch timeout for partner ${partnerId} on order ${orderId}. Re-trying hunt...`);
    const offer = order.dispatch.offeredTo.find(
      o => String(o.partnerId) === String(partnerId) && o.action === 'offered'
    );
    if (offer) offer.action = 'timeout';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    await order.save();
    
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  } else if (order.dispatch?.status === 'unassigned') {
    // If it's already unassigned (e.g. from a previous timeout), just keep hunting
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  }
}


export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne({
    ...identity,
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });

  if (!order) throw new NotFoundError('Order not found');

  const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order.');
  }

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  await tryAutoAssign(order._id);
  return { success: true };
}

export async function resendDeliveryNotificationAdmin(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);

  if (!order) throw new NotFoundError('Order not found');

  const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready', 'reached_pickup'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order. Please use Deassign & Resend instead.');
  }

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  await tryAutoAssign(order._id);
  return { success: true };
}
