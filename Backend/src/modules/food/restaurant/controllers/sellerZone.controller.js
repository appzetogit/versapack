import * as sellerZoneService from '../services/sellerZone.service.js';

const getSellerId = (req) => {
    return req.user?.restaurantId || req.user?.userId;
};

export async function listSellerZonesController(req, res, next) {
    try {
        const sellerId = getSellerId(req);
        const data = await sellerZoneService.listSellerZones(sellerId);
        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

export async function createSellerZoneController(req, res, next) {
    try {
        const sellerId = getSellerId(req);
        const result = await sellerZoneService.createSellerZone(sellerId, req.body || {});
        if (result.error) {
            return res.status(result.code || 400).json({
                success: false,
                message: result.error
            });
        }
        return res.status(201).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        next(error);
    }
}

export async function updateSellerZoneController(req, res, next) {
    try {
        const sellerId = getSellerId(req);
        const zoneId = req.params.zone_id || req.params.id;
        const result = await sellerZoneService.updateSellerZone(sellerId, zoneId, req.body || {});
        if (result.error) {
            return res.status(result.code || 400).json({
                success: false,
                message: result.error
            });
        }
        return res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        next(error);
    }
}

export async function activateSellerZoneController(req, res, next) {
    try {
        const sellerId = getSellerId(req);
        const zoneId = req.params.zone_id || req.params.id;
        const result = await sellerZoneService.activateSellerZone(sellerId, zoneId);
        if (result.error) {
            return res.status(result.code || 400).json({
                success: false,
                message: result.error
            });
        }
        return res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        next(error);
    }
}

export async function deleteSellerZoneController(req, res, next) {
    try {
        const sellerId = getSellerId(req);
        const zoneId = req.params.zone_id || req.params.id;
        const result = await sellerZoneService.deleteSellerZone(sellerId, zoneId);
        if (result.error) {
            return res.status(result.code || 400).json({
                success: false,
                message: result.error
            });
        }
        return res.status(200).json({
            success: true
        });
    } catch (error) {
        next(error);
    }
}
