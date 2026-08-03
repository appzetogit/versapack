import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    createRestaurantFood,
    updateRestaurantFood,
    updateRestaurantFoodStock,
    listLowStockFoods
} from '../services/restaurantFood.service.js';

export const createRestaurantFoodController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const food = await createRestaurantFood(restaurantId, req.body || {});
        return sendResponse(res, 201, 'Food created successfully', { food });
    } catch (error) {
        next(error);
    }
};

/** PATCH /foods/stock — set counts on many products in one call. */
export const updateRestaurantFoodStockController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const entries = Array.isArray(req.body) ? req.body : req.body?.items;
        const result = await updateRestaurantFoodStock(restaurantId, entries);
        return sendResponse(res, 200, 'Stock updated successfully', result);
    } catch (error) {
        next(error);
    }
};

/** GET /foods/low-stock — what needs reordering. */
export const listLowStockFoodsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await listLowStockFoods(restaurantId);
        return sendResponse(res, 200, 'Low stock items fetched successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateRestaurantFoodController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const food = await updateRestaurantFood(restaurantId, req.params.id, req.body || {});
        if (!food) return sendError(res, 404, 'Food not found');
        return sendResponse(res, 200, 'Food updated successfully', { food });
    } catch (error) {
        next(error);
    }
};

