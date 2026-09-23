import mongoose from 'mongoose';
import { SellerZone } from '../models/sellerZone.model.js';

const MIN_RADIUS_M = 500;
const MAX_RADIUS_M = 50000;

export async function listSellerZones(sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
        return [];
    }
    const zones = await SellerZone.find({ sellerId }).sort({ createdAt: -1 });
    return zones.map((z) => z.toResponseJSON());
}

export async function createSellerZone(sellerId, payload = {}) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
        return { error: 'Invalid seller identity', code: 400 };
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
        return { error: 'Zone name is required', code: 400 };
    }

    const centerLat = Number(payload.center_lat ?? payload.centerLat);
    if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) {
        return { error: 'center_lat must be a valid latitude between -90 and 90', code: 400 };
    }

    const centerLng = Number(payload.center_lng ?? payload.centerLng);
    if (!Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) {
        return { error: 'center_lng must be a valid longitude between -180 and 180', code: 400 };
    }

    const radiusM = parseInt(payload.radius_m ?? payload.radiusM, 10);
    if (!Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
        return {
            error: `radius_m must be an integer between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} meters`,
            code: 400
        };
    }

    const existingCount = await SellerZone.countDocuments({ sellerId });
    // First zone created for a seller is automatically activated
    const isActive = existingCount === 0;

    const zone = new SellerZone({
        sellerId,
        name,
        centerLat,
        centerLng,
        radiusM,
        isActive
    });

    await zone.save();
    return { data: zone.toResponseJSON() };
}

export async function updateSellerZone(sellerId, zoneId, payload = {}) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
        return { error: 'Invalid seller identity', code: 400 };
    }
    if (!zoneId || !mongoose.Types.ObjectId.isValid(zoneId)) {
        return { error: 'Zone not found', code: 404 };
    }

    const zone = await SellerZone.findOne({ _id: zoneId, sellerId });
    if (!zone) {
        return { error: 'Zone not found', code: 404 };
    }

    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) {
            return { error: 'Zone name cannot be empty', code: 400 };
        }
        zone.name = name;
    }

    if (payload.center_lat !== undefined || payload.centerLat !== undefined) {
        const centerLat = Number(payload.center_lat ?? payload.centerLat);
        if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) {
            return { error: 'center_lat must be a valid latitude between -90 and 90', code: 400 };
        }
        zone.centerLat = centerLat;
    }

    if (payload.center_lng !== undefined || payload.centerLng !== undefined) {
        const centerLng = Number(payload.center_lng ?? payload.centerLng);
        if (!Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) {
            return { error: 'center_lng must be a valid longitude between -180 and 180', code: 400 };
        }
        zone.centerLng = centerLng;
    }

    if (payload.radius_m !== undefined || payload.radiusM !== undefined) {
        const radiusM = parseInt(payload.radius_m ?? payload.radiusM, 10);
        if (!Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
            return {
                error: `radius_m must be an integer between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} meters`,
                code: 400
            };
        }
        zone.radiusM = radiusM;
    }

    await zone.save();
    return { data: zone.toResponseJSON() };
}

export async function activateSellerZone(sellerId, zoneId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
        return { error: 'Invalid seller identity', code: 400 };
    }
    if (!zoneId || !mongoose.Types.ObjectId.isValid(zoneId)) {
        return { error: 'Zone not found', code: 404 };
    }

    const zone = await SellerZone.findOne({ _id: zoneId, sellerId });
    if (!zone) {
        return { error: 'Zone not found', code: 404 };
    }

    await SellerZone.updateMany({ sellerId }, { isActive: false });
    zone.isActive = true;
    await zone.save();

    return {
        data: {
            id: zone._id.toString(),
            is_active: true
        }
    };
}

export async function deleteSellerZone(sellerId, zoneId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
        return { error: 'Invalid seller identity', code: 400 };
    }
    if (!zoneId || !mongoose.Types.ObjectId.isValid(zoneId)) {
        return { error: 'Zone not found', code: 404 };
    }

    const zone = await SellerZone.findOne({ _id: zoneId, sellerId });
    if (!zone) {
        return { error: 'Zone not found', code: 404 };
    }

    const wasActive = zone.isActive;
    await SellerZone.deleteOne({ _id: zoneId, sellerId });

    if (wasActive) {
        const fallbackZone = await SellerZone.findOne({ sellerId }).sort({ createdAt: -1 });
        if (fallbackZone) {
            fallbackZone.isActive = true;
            await fallbackZone.save();
        }
    }

    return { success: true };
}
