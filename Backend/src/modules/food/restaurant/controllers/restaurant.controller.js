import {
    registerRestaurant,
    listApprovedRestaurants,
    getApprovedRestaurantByIdOrSlug,
    getCurrentRestaurantProfile,
    updateRestaurantProfile,
    updateRestaurantAcceptingOrders,
    updateCurrentRestaurantDiningSettings,
    uploadRestaurantProfileImage,
    uploadRestaurantMenuImage,
    uploadRestaurantCoverImages,
    uploadRestaurantMenuImages,
    uploadRestaurantAttachment,
    listPublicOffers,
    getRestaurantComplaints,
    deleteCurrentRestaurantAccount,
    createRestaurantOnboardingFeeOrder,
} from '../services/restaurant.service.js';
import { assignStoreForCustomer } from '../services/storeAssignment.service.js';
import { getRestaurantSubscriptionHistory } from '../services/subscriptionHistory.service.js';
import { validateRestaurantRegisterDto } from '../validators/restaurant.validator.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodUnregisteredRestaurant } from '../models/unregisteredRestaurant.model.js';


export const uploadRestaurantAttachmentController = async (req, res, next) => {
    try {
        const { folder } = req.body;
        const result = await uploadRestaurantAttachment(req.file, folder);
        return sendResponse(res, 200, 'Image uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const registerRestaurantController = async (req, res, next) => {
    try {
        const validated = validateRestaurantRegisterDto(req.body);
        const restaurant = await registerRestaurant(validated, req.files);
        return sendResponse(res, 201, 'Store registered successfully', restaurant);
    } catch (error) {
        next(error);
    }
};

export const createOnboardingFeeOrderController = async (req, res, next) => {
    try {
        const ownerPhone = String(req.body?.ownerPhone || '').trim();
        const data = await createRestaurantOnboardingFeeOrder({ ownerPhone });
        return sendResponse(res, 200, 'Onboarding fee order created', data);
    } catch (error) {
        next(error);
    }
};

/**
 * Which dark store serves this location, and what it can promise.
 *
 * The first call the customer app makes after it has a location. Quick commerce does
 * not ask the customer to choose a store -- ten minutes only exists within about
 * 2.5 km, so the nearest store that can actually reach them is assigned and its shelf
 * is what they browse. A null answer is a real answer: it means we do not deliver
 * here, which the app has to say plainly rather than showing an empty catalogue.
 */
export const getServingStoreController = async (req, res, next) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return sendError(res, 400, 'lat and lng are required');
        }

        const assignment = await assignStoreForCustomer(lat, lng);
        if (!assignment) {
            return sendResponse(res, 200, 'No store serves this location yet', {
                store: null,
                serviceable: false,
            });
        }

        const { store, distanceKm, promiseMinutes } = assignment;
        return sendResponse(res, 200, 'Serving store resolved', {
            serviceable: true,
            store: {
                _id: store._id,
                name: store.restaurantName || '',
                image: store.profileImage || '',
                zoneId: store.zoneId || null,
                isAcceptingOrders: store.isAcceptingOrders !== false,
            },
            distanceKm,
            // Quoted for an empty basket. The cart re-quotes as lines are added,
            // because picking time grows with the basket and a promise that ignores
            // that is wrong on exactly the orders that matter most.
            promiseMinutes,
        });
    } catch (err) {
        next(err);
    }
};

export const listApprovedRestaurantsController = async (req, res, next) => {
    try {
        const data = await listApprovedRestaurants(req.query);
        return sendResponse(res, 200, 'Stores fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getApprovedRestaurantController = async (req, res, next) => {
    try {
        const restaurant = await getApprovedRestaurantByIdOrSlug(req.params.id);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        return sendResponse(res, 200, 'Store fetched successfully', { restaurant });
    } catch (error) {
        next(error);
    }
};

export const getCurrentRestaurantController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const restaurant = await getCurrentRestaurantProfile(restaurantId);
        return sendResponse(res, 200, 'Store fetched successfully', { restaurant });
    } catch (error) {
        next(error);
    }
};

export const updateRestaurantProfileController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const restaurant = await updateRestaurantProfile(restaurantId, req.body || {});
        return sendResponse(res, 200, 'Store updated successfully', { restaurant });
    } catch (error) {
        next(error);
    }
};

export const updateRestaurantAcceptingOrdersController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const restaurant = await updateRestaurantAcceptingOrders(restaurantId, req.body?.isAcceptingOrders);
        return sendResponse(res, 200, 'Store availability updated successfully', { restaurant });
    } catch (error) {
        next(error);
    }
};

export const updateCurrentRestaurantDiningSettingsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const restaurant = await updateCurrentRestaurantDiningSettings(restaurantId, req.body || {});
        return sendResponse(res, 200, 'Dining settings updated successfully', { restaurant });
    } catch (error) {
        next(error);
    }
};

export const uploadRestaurantProfileImageController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await uploadRestaurantProfileImage(restaurantId, req.file);
        return sendResponse(res, 200, 'Profile image uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const uploadRestaurantMenuImageController = async (req, res, next) => {
    try {
        const result = await uploadRestaurantMenuImage(req.file);
        return sendResponse(res, 200, 'Menu image uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const uploadRestaurantCoverImagesController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await uploadRestaurantCoverImages(restaurantId, req.files || []);
        return sendResponse(res, 200, 'Store photos uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const uploadRestaurantMenuImagesController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await uploadRestaurantMenuImages(restaurantId, req.files || []);
        return sendResponse(res, 200, 'Menu photos uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const listPublicOffersController = async (req, res, next) => {
    try {
        const data = await listPublicOffers({ ...req.query, userId: req.user?.userId });
        return sendResponse(res, 200, 'Offers fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getRestaurantComplaintsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getRestaurantComplaints(restaurantId, req.query || {});
        return sendResponse(res, 200, 'Complaints fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const deleteCurrentRestaurantAccountController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteCurrentRestaurantAccount(restaurantId);
        return sendResponse(res, 200, 'Store account deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

export const getRestaurantSubscriptionHistoryController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getRestaurantSubscriptionHistory(restaurantId, req.query || {});
        return sendResponse(res, 200, 'Subscription history fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const registerUnregisteredRestaurantController = async (req, res, next) => {
    try {
        const { ownerName, restaurantName, mobileNumber, emailId, location } = req.body;
        if (!ownerName || !restaurantName || !mobileNumber || !emailId || !location) {
            return sendError(res, 400, 'All fields are required');
        }
        const newUnregistered = await FoodUnregisteredRestaurant.create({
            ownerName,
            restaurantName,
            mobileNumber,
            emailId,
            location
        });
        return sendResponse(res, 201, 'Store details submitted successfully', newUnregistered);
    } catch (error) {
        next(error);
    }
};
