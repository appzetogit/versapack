import mongoose from 'mongoose';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { getFoodDisplayOtherPrice, getFoodDisplayPrice } from '../../admin/services/foodVariant.service.js';
import { restoreExpiredFoodAvailability } from './foodAvailability.service.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildCategoryKeywords = (categorySlug) => {
    const raw = String(categorySlug || '').trim().toLowerCase();
    if (!raw || raw === 'all') return [];

    const normalized = raw.replace(/&/g, ' and ').replace(/-/g, ' ').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    return [...new Set([raw, normalized, ...words])];
};

const isSwitch99Price = (price) => String(price ?? '').includes('99');

export async function listPublicFoods(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 1000);
    const zoneIdRaw = String(query.zoneId || '').trim();
    const categorySlug = String(query.categorySlug || query.category || '').trim().toLowerCase();
    const promo = String(query.promo || query.promoSlug || '').trim().toLowerCase();
    const isSwitch99Promo = promo === 'switch99' || promo === 'under-250' || promo === 'under250';

    const restaurantFilter = { status: 'approved' };
    if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(zoneIdRaw);
    }

    const restaurants = await FoodRestaurant.find(restaurantFilter)
        .select('_id restaurantName slug zoneId profileImage rating totalRatings ratingCount estimatedDeliveryTime estimatedDeliveryTimeMinutes location coverImages menuImages isActive isAcceptingOrders outletTimings openDays deliveryTimings openingTime closingTime')
        .lean();

    if (!restaurants.length) {
        return { foods: [], total: 0 };
    }

    const restaurantMap = new Map(
        restaurants.map((restaurant) => [String(restaurant._id), restaurant])
    );
    const restaurantIds = restaurants.map((restaurant) => restaurant._id);

    await restoreExpiredFoodAvailability({ restaurantId: { $in: restaurantIds } });

    const foodFilter = {
        restaurantId: { $in: restaurantIds },
        approvalStatus: 'approved',
        isAvailable: { $ne: false }
    };

    const keywords = buildCategoryKeywords(categorySlug);
    if (keywords.length > 0) {
        foodFilter.$or = keywords.flatMap((keyword) => {
            const rx = escapeRegex(keyword);
            return [
                { name: { $regex: rx, $options: 'i' } },
                { categoryName: { $regex: rx, $options: 'i' } }
            ];
        });
    }

    const list = await FoodItem.find(foodFilter)
        .sort({ createdAt: -1 })
        .limit(isSwitch99Promo ? Math.max(limit, 2000) : limit)
        .lean();

    const foods = list
        .map((food) => {
        const restaurant = restaurantMap.get(String(food.restaurantId));
        const price = getFoodDisplayPrice(food);
        return {
            id: food._id,
            _id: food._id,
            restaurantId: food.restaurantId,
            restaurantName: restaurant?.restaurantName || 'Unknown Restaurant',
            categoryId: food.categoryId || null,
            categoryName: food.categoryName || '',
            category: food.categoryName || '',
            name: food.name,
            description: food.description || '',
            price,
            otherPrice: getFoodDisplayOtherPrice(food),
            image: food.image || '',
            foodType: food.foodType || 'Non-Veg',
            isAvailable: food.isAvailable !== false,
            preparationTime: food.preparationTime || '',
            approvalStatus: food.approvalStatus || 'approved'
        };
    })
        .filter((food) => {
            if (food.isAvailable === false) return false;
            if (isSwitch99Promo) return isSwitch99Price(food.price);
            return true;
        })
        .slice(0, limit);

    return { foods, total: foods.length };
}
