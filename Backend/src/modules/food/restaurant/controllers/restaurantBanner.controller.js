import { sendResponse } from '../../../../utils/response.js';
import {
    listRestaurantBanners,
    uploadRestaurantBanners,
    deleteRestaurantBanner,
    reorderRestaurantBanners
} from '../services/restaurantBanner.service.js';

export const listBannersController = async (req, res, next) => {
    try {
        const data = await listRestaurantBanners(req.user?.userId);
        return sendResponse(res, 200, 'Banners fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const uploadBannersController = async (req, res, next) => {
    try {
        const data = await uploadRestaurantBanners(req.user?.userId, req.files || []);
        return sendResponse(res, 201, 'Banners uploaded successfully', data);
    } catch (error) {
        next(error);
    }
};

export const deleteBannerController = async (req, res, next) => {
    try {
        // URL comes in the body — banner URLs contain slashes and can't be a path param.
        const data = await deleteRestaurantBanner(req.user?.userId, req.body?.bannerUrl);
        return sendResponse(res, 200, 'Banner deleted successfully', data);
    } catch (error) {
        next(error);
    }
};

export const reorderBannersController = async (req, res, next) => {
    try {
        const data = await reorderRestaurantBanners(req.user?.userId, req.body?.banners);
        return sendResponse(res, 200, 'Banners reordered successfully', data);
    } catch (error) {
        next(error);
    }
};
