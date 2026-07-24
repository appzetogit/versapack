import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import mongoose from 'mongoose';

const RESTAURANT_SEARCH_SELECT = [
    'restaurantName',
    'restaurantNameNormalized',
    'cuisines',
    'profileImage',
    'coverImages',
    'estimatedDeliveryTime',
    'estimatedDeliveryTimeMinutes',
    'offer',
    'featuredDish',
    'featuredPrice',
    'rating',
    'totalRatings',
    'isAcceptingOrders',
    'status',
    'pureVegRestaurant',
    'createdAt',
    'location',
    'zoneId',
    'area',
    'city'
].join(' ');

const FOOD_MATCH_SELECT = '_id restaurantId name image';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toFiniteNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const addDistanceScore = (restaurant, userLat, userLng) => {
    if (!restaurant?.location?.latitude || !restaurant?.location?.longitude) {
        return { ...restaurant, distanceScore: 999 };
    }

    const restaurantLat = Number(restaurant.location.latitude);
    const restaurantLng = Number(restaurant.location.longitude);
    if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
        return { ...restaurant, distanceScore: 999 };
    }

    const dLat = (restaurantLat - userLat) * Math.PI / 180;
    const dLon = (restaurantLng - userLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(userLat * Math.PI / 180) * Math.cos(restaurantLat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return { ...restaurant, distanceScore: 6371 * c };
};

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items,
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const {
        q,
        lat,
        lng,
        radiusKm = 20,
        categoryId,
        minRating,
        maxDeliveryTime,
        isVeg,
        page = 1,
        limit = 20,
        zoneId,
        strictZone
    } = query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(escapeRegex(term), 'i') : null;
    const userLat = toFiniteNumber(lat);
    const userLng = toFiniteNumber(lng);
    const hasGeoSorting = userLat !== null && userLng !== null;
    const fetchLimit = Math.min(limitNumber * 3, 120);

    // 1. Initial Filter (approved status and basic conditions)
    const restaurantFilter = { status: 'approved' };

    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime, 10) };
    }

    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const catFoodItems = await FoodItem.find({
            categoryId: new mongoose.Types.ObjectId(categoryId),
            approvalStatus: 'approved'
        }).select('restaurantId').limit(fetchLimit * 4).lean();

        const catRestaurantIds = [...new Set(catFoodItems.map((food) => food.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) };
        } else {
            return {
                success: true,
                data: { restaurants: [], total: 0, page: pageNumber, limit: limitNumber }
            };
        }
    }

    // 3. Search Matching
    if (regex) {
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } }
            ]
        })
            .select(RESTAURANT_SEARCH_SELECT)
            .sort({ rating: -1, createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        matchedRestaurants.forEach((restaurant) => {
            restaurantDetailsMap.set(restaurant._id.toString(), { ...restaurant, matchType: 'restaurant' });
        });

        const foodFilters = { approvalStatus: 'approved' };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';

        const matchedFoods = await FoodItem.find({
            ...foodFilters,
            name: { $regex: regex }
        })
            .select(FOOD_MATCH_SELECT)
            .sort({ createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        const matchedFoodsByRestaurant = matchedFoods.reduce((acc, food) => {
            const restaurantId = String(food.restaurantId || '');
            if (restaurantId && !acc.has(restaurantId)) {
                acc.set(restaurantId, food);
            }
            return acc;
        }, new Map());

        const remainingIds = Array.from(matchedFoodsByRestaurant.keys()).filter((id) => !restaurantDetailsMap.has(id));
        if (remainingIds.length > 0) {
            const rsForFoods = await FoodRestaurant.find({
                ...restaurantFilter,
                _id: { $in: remainingIds.map((id) => new mongoose.Types.ObjectId(id)) }
            })
                .select(RESTAURANT_SEARCH_SELECT)
                .limit(fetchLimit)
                .lean();

            rsForFoods.forEach((restaurant) => {
                const matchedFood = matchedFoodsByRestaurant.get(restaurant._id.toString());
                restaurantDetailsMap.set(restaurant._id.toString(), {
                    ...restaurant,
                    matchType: 'food',
                    matchedDish: matchedFood?.name,
                    matchedDishImage: matchedFood?.image,
                    matchedDishId: matchedFood?._id
                });
            });
        }
    } else {
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .select(RESTAURANT_SEARCH_SELECT)
            .sort({ rating: -1, createdAt: -1 })
            .limit(fetchLimit)
            .lean();

        allMatching.forEach((restaurant) => {
            restaurantDetailsMap.set(restaurant._id.toString(), restaurant);
        });
    }

    let results = Array.from(restaurantDetailsMap.values());

    if (hasGeoSorting && results.length > 0) {
        results = results
            .map((restaurant) => addDistanceScore(restaurant, userLat, userLng))
            .sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    const finalResult = {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + limitNumber),
            total: results.length,
            page: pageNumber,
            limit: limitNumber,
            zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
        }
    };

    const shouldSkipZoneFallback =
        strictZone === true ||
        strictZone === 'true' ||
        !!(categoryId && mongoose.Types.ObjectId.isValid(categoryId));

    if (
        !shouldSkipZoneFallback &&
        results.length === 0 &&
        zoneId &&
        mongoose.Types.ObjectId.isValid(zoneId)
    ) {
        const fallbackResults = await searchUnified({ ...query, zoneId: null }, options);
        if (fallbackResults.data.total > 0) {
            fallbackResults.data.wasFallback = true;
            return fallbackResults;
        }
    }

    return finalResult;
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const filter = {
        isActive: true,
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
        filter.$or = [
            { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
            { zoneId: { $exists: false } },
            { zoneId: null }
        ];
    }

    const categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return categories;
};
