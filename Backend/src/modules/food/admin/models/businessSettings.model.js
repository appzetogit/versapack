import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, default: 'Switcheats' },
        email: { type: String, required: true, default: 'admin@switcheats.com' },
        phone: {
            countryCode: { type: String, default: '+91' },
            number: { type: String, default: '' }
        },
        address: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        region: { type: String, default: 'India' },
        logo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        favicon: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        restaurantLogo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        restaurantFavicon: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        deliveryLogo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        deliveryFavicon: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        powerScanning: {
            user: {
                themeColor: { type: String, default: '#FA0272' },
                fontFamily: { type: String, default: 'Poppins' }
            },
            restaurant: {
                themeColor: { type: String, default: '#2563EB' },
                fontFamily: { type: String, default: 'Poppins' }
            },
            delivery: {
                themeColor: { type: String, default: '#00B761' },
                fontFamily: { type: String, default: 'Poppins' }
            }
        },
        orderAcceptanceTimeMinutes: { type: Number, default: 4, min: 1, max: 20 }
    },
    { timestamps: true }
);

export const FoodBusinessSettings = mongoose.model('FoodBusinessSettings', businessSettingsSchema);
