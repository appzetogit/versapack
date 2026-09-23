import { searchUnified, searchProducts, getAdminCategories } from '../services/search.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { assignStoreForCustomer } from '../../restaurant/services/storeAssignment.service.js';

const NO_SERVICEABLE_STORE = '__no_serviceable_store__';

/**
 * Resolves X-User-Latitude / X-User-Longitude headers to a storeId, before the
 * cache middleware runs, so the cache key (built from req.query) varies by the
 * resolved store rather than by raw, near-unique GPS coordinates.
 *
 * An explicit storeId/zoneId query param always wins — this only fills in what
 * the client didn't already tell us. When no store serves the location, the
 * sentinel is passed through so the controller can return an explicit empty
 * catalogue instead of searchProducts' default "no storeId -> unscoped" fallback.
 */
export const resolveStoreFromLocationHeaders = async (req, res, next) => {
    try {
        if (req.query.storeId || req.query.zoneId) return next();

        const lat = Number(req.headers['x-user-latitude']);
        const lng = Number(req.headers['x-user-longitude']);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return next();

        const assignment = await assignStoreForCustomer(lat, lng);
        req.query.storeId = assignment?.store?._id ? String(assignment.store._id) : NO_SERVICEABLE_STORE;
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
        const { q, categoryId, zoneId, storeId, isVeg, inStockOnly, page, limit } = req.query;

        if (storeId === NO_SERVICEABLE_STORE) {
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
            storeId,
            isVeg,
            inStockOnly,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20
        });

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
