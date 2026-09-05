import * as masterProductService from '../services/masterProduct.service.js';
import { sendResponse } from '../../../../utils/response.js';

export async function listMasterProductsController(req, res, next) {
    try {
        const data = await masterProductService.listMasterProducts(req.query || {});
        return sendResponse(res, 200, 'Master products fetched', data);
    } catch (err) {
        next(err);
    }
}

export async function getMasterProductController(req, res, next) {
    try {
        const product = await masterProductService.getMasterProduct(req.params.id);
        return sendResponse(res, 200, 'Master product fetched', { product });
    } catch (err) {
        next(err);
    }
}

export async function createMasterProductController(req, res, next) {
    try {
        const product = await masterProductService.createMasterProduct(
            req.body || {},
            req.user?.userId
        );
        return sendResponse(res, 201, 'Master product created', { product });
    } catch (err) {
        next(err);
    }
}

export async function updateMasterProductController(req, res, next) {
    try {
        const product = await masterProductService.updateMasterProduct(
            req.params.id,
            req.body || {}
        );
        return sendResponse(res, 200, 'Master product updated', { product });
    } catch (err) {
        next(err);
    }
}

export async function listMasterListingsController(req, res, next) {
    try {
        const data = await masterProductService.listMasterListings(req.params.id, req.query || {});
        return sendResponse(res, 200, 'Listings fetched', data);
    } catch (err) {
        next(err);
    }
}

/** Attach a seller listing to a master, or detach it with masterProductId: null. */
export async function linkListingToMasterController(req, res, next) {
    try {
        const listing = await masterProductService.linkListingToMaster(
            req.params.listingId,
            req.body?.masterProductId ?? null
        );
        return sendResponse(res, 200, 'Listing link updated', { listing });
    } catch (err) {
        next(err);
    }
}
