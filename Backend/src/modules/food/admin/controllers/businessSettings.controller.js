import { FoodBusinessSettings } from '../models/businessSettings.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';

const POWER_SCANNING_DEFAULT = {
    user: { themeColor: '#FA0272', fontFamily: 'Poppins' },
    restaurant: { themeColor: '#2563EB', fontFamily: 'Poppins' },
    delivery: { themeColor: '#00B761', fontFamily: 'Poppins' }
};

const POWER_SCANNING_FONT_OPTIONS = [
    'Poppins', 'Outfit', 'Inter', 'Roboto', 'Montserrat',
    'Nunito', 'Open Sans', 'Lato', 'Manrope', 'Raleway',
    'Merriweather', 'Playfair Display', 'Ubuntu', 'Rubik', 'Work Sans'
];

const normalizeHexColor = (value, fallback) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
};

const normalizeFontFamily = (value, fallback) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    return POWER_SCANNING_FONT_OPTIONS.includes(raw) ? raw : fallback;
};

const normalizeOrderAcceptanceMinutes = (value, fallback = 4) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(1, Math.min(20, Math.round(numeric)));
};

const buildPowerScanningPayload = (payload = {}, existing = POWER_SCANNING_DEFAULT) => ({
    user: {
        themeColor: normalizeHexColor(payload?.user?.themeColor, existing?.user?.themeColor || POWER_SCANNING_DEFAULT.user.themeColor),
        fontFamily: normalizeFontFamily(payload?.user?.fontFamily, existing?.user?.fontFamily || POWER_SCANNING_DEFAULT.user.fontFamily)
    },
    restaurant: {
        themeColor: normalizeHexColor(payload?.restaurant?.themeColor, existing?.restaurant?.themeColor || POWER_SCANNING_DEFAULT.restaurant.themeColor),
        fontFamily: normalizeFontFamily(payload?.restaurant?.fontFamily, existing?.restaurant?.fontFamily || POWER_SCANNING_DEFAULT.restaurant.fontFamily)
    },
    delivery: {
        themeColor: normalizeHexColor(payload?.delivery?.themeColor, existing?.delivery?.themeColor || POWER_SCANNING_DEFAULT.delivery.themeColor),
        fontFamily: normalizeFontFamily(payload?.delivery?.fontFamily, existing?.delivery?.fontFamily || POWER_SCANNING_DEFAULT.delivery.fontFamily)
    }
});

const ensurePowerScanningOnSettings = (settingsDocOrPlain = null) => {
    const current = settingsDocOrPlain || {};
    const normalized = buildPowerScanningPayload(
        current?.powerScanning || {},
        current?.powerScanning || POWER_SCANNING_DEFAULT
    );
    return {
        ...current,
        powerScanning: normalized
    };
};

export async function getBusinessSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            // Create default settings if none exist
            settings = await FoodBusinessSettings.create({
                companyName: 'Switcheats',
                email: 'admin@switcheats.com'
            });
        }

        // Backend-side safety: always expose normalized powerScanning in public payload.
        const normalizedPowerScanning = buildPowerScanningPayload(
            settings?.powerScanning || {},
            settings?.powerScanning || POWER_SCANNING_DEFAULT
        );

        // Backfill old docs that might not have powerScanning persisted yet.
        const persistedPowerScanning = settings?.powerScanning || {};
        const wasMissingAnyModule =
            !persistedPowerScanning?.user ||
            !persistedPowerScanning?.restaurant ||
            !persistedPowerScanning?.delivery;
        if (wasMissingAnyModule) {
            settings.powerScanning = normalizedPowerScanning;
            await settings.save();
        }

        const payload = ensurePowerScanningOnSettings(settings.toObject());
        return sendResponse(res, 200, 'Business settings fetched successfully', payload);
    } catch (error) {
        next(error);
    }
}

export async function getPowerScanningSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne().lean();
        if (!settings) {
            settings = await FoodBusinessSettings.create({
                companyName: 'Switcheats',
                email: 'admin@switcheats.com'
            });
        }
        const payload = buildPowerScanningPayload(settings?.powerScanning || {}, settings?.powerScanning || POWER_SCANNING_DEFAULT);
        return sendResponse(res, 200, 'Power scanning settings fetched successfully', payload);
    } catch (error) {
        next(error);
    }
}

export async function updatePowerScanningSettings(req, res, next) {
    try {
        const payload = req.body || {};
        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings({
                companyName: 'Switcheats',
                email: 'admin@switcheats.com'
            });
        }

        settings.powerScanning = buildPowerScanningPayload(payload, settings.powerScanning || POWER_SCANNING_DEFAULT);
        await settings.save();

        return sendResponse(res, 200, 'Power scanning settings updated successfully', settings.powerScanning);
    } catch (error) {
        next(error);
    }
}

export async function getOrderAcceptanceSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = await FoodBusinessSettings.create({
                companyName: 'Switcheats',
                email: 'admin@switcheats.com'
            });
        }

        const minutes = normalizeOrderAcceptanceMinutes(settings.orderAcceptanceTimeMinutes);
        if (settings.orderAcceptanceTimeMinutes !== minutes) {
            settings.orderAcceptanceTimeMinutes = minutes;
            await settings.save();
        }

        return sendResponse(res, 200, 'Order acceptance settings fetched successfully', {
            orderAcceptanceTimeMinutes: minutes,
            acceptanceWindowSeconds: minutes * 60
        });
    } catch (error) {
        next(error);
    }
}

export async function updateOrderAcceptanceSettings(req, res, next) {
    try {
        const rawMinutes = req.body?.orderAcceptanceTimeMinutes;
        const numeric = Number(rawMinutes);
        if (!Number.isFinite(numeric)) {
            return res.status(400).json({ success: false, message: 'Order acceptance time is required' });
        }

        const minutes = Math.round(numeric);
        if (minutes < 1 || minutes > 20) {
            return res.status(400).json({ success: false, message: 'Order acceptance time must be between 1 and 20 minutes' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings();
        }

        settings.orderAcceptanceTimeMinutes = minutes;
        await settings.save();

        return sendResponse(res, 200, 'Order acceptance settings updated successfully', {
            orderAcceptanceTimeMinutes: minutes,
            acceptanceWindowSeconds: minutes * 60
        });
    } catch (error) {
        next(error);
    }
}

export async function updateBusinessSettings(req, res, next) {
    try {
        const data = req.body.data ? JSON.parse(req.body.data) : {};
        const { companyName, email, phoneCountryCode, phoneNumber, address, state, pincode, region } = data;

        // Validation
        if (!companyName || companyName.trim().length < 2 || companyName.trim().length > 50) {
            return res.status(400).json({ success: false, message: 'Company name must be between 2 and 50 characters' });
        }
        if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid email address (max 100 characters)' });
        }
        if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid phone number (7-15 digits required)' });
        }
        if (address && address.length > 250) {
            return res.status(400).json({ success: false, message: 'Address is too long (max 250 characters)' });
        }
        if (state && state.length > 50) {
            return res.status(400).json({ success: false, message: 'State name is too long (max 50 characters)' });
        }
        if (pincode && !/^\d{4,10}$/.test(pincode.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid pincode (4-10 digits required)' });
        }

        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings();
        }

        if (companyName) settings.companyName = companyName;
        if (email) settings.email = email;
        if (phoneCountryCode || phoneNumber) {
            settings.phone = {
                countryCode: phoneCountryCode || settings.phone?.countryCode || '+91',
                number: phoneNumber || settings.phone?.number || ''
            };
        }
        if (address !== undefined) settings.address = address;
        if (state !== undefined) settings.state = state;
        if (pincode !== undefined) settings.pincode = pincode;
        if (region) settings.region = region;

        // Handle file uploads
        if (req.files) {
            if (req.files.logo) {
                const logoResult = await uploadImageBufferDetailed(req.files.logo[0].buffer, 'business/logos');
                settings.logo = {
                    url: logoResult.secure_url,
                    publicId: logoResult.public_id
                };
            }
            if (req.files.favicon) {
                const faviconResult = await uploadImageBufferDetailed(req.files.favicon[0].buffer, 'business/favicons');
                settings.favicon = {
                    url: faviconResult.secure_url,
                    publicId: faviconResult.public_id
                };
            }
            if (req.files.restaurantLogo) {
                const restaurantLogoResult = await uploadImageBufferDetailed(req.files.restaurantLogo[0].buffer, 'business/restaurant/logos');
                settings.restaurantLogo = {
                    url: restaurantLogoResult.secure_url,
                    publicId: restaurantLogoResult.public_id
                };
            }
            if (req.files.restaurantFavicon) {
                const restaurantFaviconResult = await uploadImageBufferDetailed(req.files.restaurantFavicon[0].buffer, 'business/restaurant/favicons');
                settings.restaurantFavicon = {
                    url: restaurantFaviconResult.secure_url,
                    publicId: restaurantFaviconResult.public_id
                };
            }
            if (req.files.deliveryLogo) {
                const deliveryLogoResult = await uploadImageBufferDetailed(req.files.deliveryLogo[0].buffer, 'business/delivery/logos');
                settings.deliveryLogo = {
                    url: deliveryLogoResult.secure_url,
                    publicId: deliveryLogoResult.public_id
                };
            }
            if (req.files.deliveryFavicon) {
                const deliveryFaviconResult = await uploadImageBufferDetailed(req.files.deliveryFavicon[0].buffer, 'business/delivery/favicons');
                settings.deliveryFavicon = {
                    url: deliveryFaviconResult.secure_url,
                    publicId: deliveryFaviconResult.public_id
                };
            }
        }

        await settings.save();
        return sendResponse(res, 200, 'Business settings updated successfully', settings);
    } catch (error) {
        next(error);
    }
}
