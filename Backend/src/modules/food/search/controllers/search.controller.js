import { searchUnified, searchProducts, getAdminCategories } from '../services/search.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { assignStoreForCustomer } from '../../restaurant/services/storeAssignment.service.js';
import { findInRangeSellerZones } from '../../shared/zoneServiceability.js';

const NO_SERVICEABLE_STORE = '__no_serviceable_store__';

/**
 * Resolves X-User-Latitude / X-User-Longitude headers to a storeId (dark-store
 * distance assignment) AND a list of in-range marketplace sellers (SellerZone radius),
 * before the cache middleware runs, so the cache key (built from req.query) varies by
 * the resolved ids rather than by raw, near-unique GPS coordinates.
 *
 * These are two different, additive mechanisms: a customer is assigned at most one
 * dark store by distance, but can see every marketplace seller whose own circular
 * zone reaches them -- the same distinction storeAssignment.service.js already draws
 * ("a marketplace seller next door must never be assigned by distance").
 *
 * An explicit storeId/zoneId query param always wins -- this only fills in what the
 * client didn't already tell us. When no dark store serves the location, the sentinel
 * is passed through; searchProductsController only treats that as a fully empty
 * catalogue if there are also no in-range marketplace sellers.
 */
export const resolveStoreFromLocationHeaders = async (req, res, next) => {
    try {
        if (req.query.storeId || req.query.zoneId) return next();

        const lat = Number(req.headers['x-user-latitude']);
        const lng = Number(req.headers['x-user-longitude']);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return next();

        const [assignment, inRangeZones] = await Promise.all([
            assignStoreForCustomer(lat, lng),
            findInRangeSellerZones(lat, lng),
        ]);

        req.query.storeId = assignment?.store?._id ? String(assignment.store._id) : NO_SERVICEABLE_STORE;
        if (inRangeZones.length) {
            req.query.nearSellerIds = inRangeZones.map((z) => z.sellerId).join(',');
            // Debug-only distance, kept off req.query (and so out of the cache key) since
            // it doesn't change WHICH products match, only a display value on each one.
            req.nearSellerDistanceById = Object.fromEntries(
                inRangeZones.map((z) => [z.sellerId, z.distanceMeters]),
            );
        }
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Unified Search for Restaurants, Food Items, and Cuisines
 */
export const searchController = async (req, res, next) => {
    try {
        const { q, lat, lng, radiusKm, categoryId, minRating, maxDeliveryTime, isVeg, page, limit, zoneId, strictZone } = req.query;

        const results = await searchUnified({
            q,
            lat,
            lng,
            radiusKm,
            categoryId,
            minRating,
            maxDeliveryTime,
            isVeg,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20,
            zoneId,
            strictZone
        });

        return sendResponse(res, 200, 'Search results fetched successfully', results.data);
    } catch (error) {
        next(error);
    }
};

/**
 * Product search — returns items, not the sellers that stock them.
 */
export const searchProductsController = async (req, res, next) => {
    try {
        const { q, categoryId, zoneId, storeId, nearSellerIds, isVeg, inStockOnly, page, limit } = req.query;

        const hasNearSellers = typeof nearSellerIds === 'string' && nearSellerIds.length > 0;

        if (storeId === NO_SERVICEABLE_STORE && !hasNearSellers) {
            return sendResponse(res, 200, 'Products fetched successfully', {
                products: [],
                total: 0,
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20
            });
        }

        const results = await searchProducts({
            q,
            categoryId,
            zoneId,
            // The sentinel isn't a real store id -- clear it so the service falls
            // through to nearSellerIds-only (or fully unscoped) rather than trying
            // to match it as one.
            storeId: storeId === NO_SERVICEABLE_STORE ? undefined : storeId,
            nearSellerIds,
            isVeg,
            inStockOnly,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20
        }, req.nearSellerDistanceById);

        return sendResponse(res, 200, 'Products fetched successfully', results);
    } catch (error) {
        next(error);
    }
};

/**
 * Fetch List of Admin-only Categories
 */
export const listAdminCategoriesController = async (req, res, next) => {
    try {
        const { zoneId } = req.query;
        const categories = await getAdminCategories({ zoneId });
        
        return sendResponse(res, 200, 'Admin categories fetched successfully', { categories });
    } catch (error) {
        next(error);
    }
};
