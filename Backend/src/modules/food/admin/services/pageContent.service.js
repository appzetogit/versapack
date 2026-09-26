import { FoodPageContent } from '../models/pageContent.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const normalizeKey = (key) => String(key || '').trim().toLowerCase();

const decodeHtmlEntities = (value) => {
    if (value === null || value === undefined) return value;
    let s = String(value);
    if (!s.includes('&')) return s;
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
};

const normalizeLegalForResponse = (legal) => {
    if (!legal || typeof legal !== 'object') return legal;
    const title = legal.title ?? '';
    const content = decodeHtmlEntities(legal.content ?? '');
    const email = legal.email ?? '';
    const mobile = legal.mobile ?? '';
    return { ...legal, title, content, email, mobile };
};

const normalizeAboutForResponse = (about) => {
    if (!about || typeof about !== 'object') return about;
    return {
        ...about,
        appName: decodeHtmlEntities(about.appName ?? ''),
        version: decodeHtmlEntities(about.version ?? ''),
        description: decodeHtmlEntities(about.description ?? ''),
        logo: decodeHtmlEntities(about.logo ?? '')
    };
};

const DEFAULT_LEGAL_PAGES = {
    terms: {
        title: 'Terms & Conditions',
        content: 'Welcome to VersaPack. By accessing or using our platform, mobile apps, and services, you agree to comply with and be bound by our terms and conditions governing order placements, deliveries, payment processing, and account usage.',
        email: 'support@versapack.in',
        mobile: ''
    },
    privacy: {
        title: 'Privacy Policy',
        content: 'Your privacy is important to us. VersaPack collects necessary personal information including name, delivery address, phone number, and location data solely to process orders, facilitate food delivery, and enhance user experience. We do not sell or share your data with unauthorized third parties.',
        email: 'privacy@versapack.in',
        mobile: ''
    },
    privacy_restaurant: {
        title: 'Seller Partner Privacy Policy',
        content: 'Welcome to VersaPack Seller Partner Privacy Policy. We collect restaurant business details, FSSAI license numbers, bank account details for payouts, store location coordinates, and operational contact numbers solely to facilitate food orders, process seller payouts, and ensure compliance with food safety regulations. Your business information is securely stored and never shared with unauthorized third parties.',
        email: 'seller-support@versapack.in',
        mobile: ''
    },
    faq: {
        title: 'Seller Partner FAQ & Help Center',
        content: `<h3>Frequently Asked Questions for Seller Partners</h3>
<ul>
  <li><strong>How do I accept live orders?</strong><br/>Open the Seller App, navigate to the Active Orders tab, tap 'Accept Order', and set the preparation time in minutes.</li>
  <li><strong>When do I receive my payouts?</strong><br/>Payouts are calculated based on completed orders and processed directly to your registered bank account according to your subscription/commission billing cycle.</li>
  <li><strong>How do I update dish availability or stock?</strong><br/>Go to 'Menu Categories' or 'Stock Take' in the Seller App to toggle any item ON/OFF or mark items out of stock instantly.</li>
  <li><strong>How do I turn on Rush Hour / Busy Mode?</strong><br/>If your kitchen is overwhelmed, toggle your outlet status to 'BUSY' or 'CLOSED' in the top bar of the Seller App.</li>
  <li><strong>How do I update FSSAI certificate or GST details?</strong><br/>Upload your renewed FSSAI or GST documents under Store Profile -> Documents for admin verification.</li>
</ul>`,
        email: 'seller-support@versapack.in',
        mobile: ''
    },
    help: {
        title: 'Seller Partner Help Center',
        content: 'Welcome to VersaPack Seller Help Center. If you have questions about order acceptance, menu customization, store timing, payouts, or FSSAI compliance, please check our FAQ section or contact seller support.',
        email: 'seller-support@versapack.in',
        mobile: ''
    },
    refund: {
        title: 'Refund Policy',
        content: 'Refunds for cancelled or eligible orders are processed to the original payment method or credited to your VersaPack wallet within 3-5 business days in accordance with our return guidelines.',
        email: 'support@versapack.in',
        mobile: ''
    },
    cancellation: {
        title: 'Cancellation Policy',
        content: 'Orders can be cancelled before they are confirmed or prepared by the merchant. Once an order is prepared or out for delivery, cancellation may be subject to cancellation charges.',
        email: 'support@versapack.in',
        mobile: ''
    },
    shipping: {
        title: 'Delivery Policy',
        content: 'VersaPack provides hyper-local food and quick-commerce delivery. Delivery times depend on merchant preparation, distance, weather, and traffic conditions.',
        email: 'support@versapack.in',
        mobile: ''
    },
    support: {
        title: 'Customer Support',
        content: 'If you have any issues with your orders or account, please contact our support team at support@versapack.in.',
        email: 'support@versapack.in',
        mobile: ''
    }
};

const DEFAULT_ABOUT_PAGE = {
    appName: 'VersaPack',
    version: '1.0.0',
    description: 'VersaPack is your all-in-one platform for hyper-local food delivery, quick commerce, and seamless merchant-to-customer connection.',
    logo: '',
    features: [],
    stats: []
};

export const getPublicPageByKey = async (key, module = 'ALL') => {
    const k = normalizeKey(key);
    const m = String(module || 'ALL').toUpperCase();
    
    // 1. Try exact match for requested module
    let doc = await FoodPageContent.findOne({ key: k, module: m }).lean();
    
    // 2. Fetch the most recently updated document for this key across all modules
    const latestDoc = await FoodPageContent.findOne({ key: k }).sort({ updatedAt: -1 }).lean();

    // If a global/newer update exists by Admin, prefer the latest update so all apps (Delivery, User, Restaurant) stay in sync
    if (latestDoc) {
        if (!doc || (latestDoc.updatedAt && doc.updatedAt && new Date(latestDoc.updatedAt) > new Date(doc.updatedAt))) {
            doc = latestDoc;
        }
    }

    const fallbackKey = (k === 'privacy' && (m === 'RESTAURANT' || m === 'SELLER')) ? 'privacy_restaurant' : k;

    if (!doc) {
        if (k === 'about') {
            return { key: k, module: m, data: DEFAULT_ABOUT_PAGE };
        }
        const fallback = DEFAULT_LEGAL_PAGES[fallbackKey] || DEFAULT_LEGAL_PAGES[k] || null;
        return { key: k, module: m, data: fallback };
    }

    if (k === 'about') {
        const aboutData = doc.about && (doc.about.appName || doc.about.description) ? doc.about : DEFAULT_ABOUT_PAGE;
        return { key: k, module: doc.module || m, data: normalizeAboutForResponse(aboutData) };
    }

    const legalData = doc.legal && (doc.legal.title || doc.legal.content) ? doc.legal : (DEFAULT_LEGAL_PAGES[fallbackKey] || DEFAULT_LEGAL_PAGES[k] || null);
    return { key: k, module: doc.module || m, data: normalizeLegalForResponse(legalData) };
};

export const getAdminPageByKey = async (key, module = 'ALL') => getPublicPageByKey(key, module);

export const upsertLegalPage = async (key, payload, updatedBy, module = 'ALL') => {
    const k = normalizeKey(key);
    let m = String(module || 'ALL').toUpperCase();
    if (!['USER', 'DELIVERY', 'RESTAURANT', 'ALL'].includes(m)) {
        m = 'ALL';
    }
    if (!['terms', 'privacy', 'refund', 'shipping', 'cancellation', 'support', 'faq', 'help'].includes(k)) {
        throw new ValidationError('Invalid page key');
    }
    const title = String(payload?.title || '').trim();
    const content = decodeHtmlEntities(String(payload?.content || '')).trim();
    const email = String(payload?.email || '').trim();
    const mobile = String(payload?.mobile || '').trim();

    const legalPayload = { title, content, email, mobile };

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: k, module: m },
        {
            $set: {
                key: k,
                module: m,
                legal: legalPayload,
                about: undefined,
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            }
        },
        { upsert: true, new: true }
    ).lean();

    // Synchronize across all module records for this key so Delivery, Restaurant, and User apps immediately see Admin's update
    if (m === 'ALL' || m === 'USER') {
        await FoodPageContent.updateMany(
            { key: k },
            {
                $set: {
                    legal: legalPayload,
                    updatedBy: updatedBy || null,
                    updatedByRole: 'ADMIN'
                }
            }
        );
    }

    return { key: k, module: m, data: normalizeLegalForResponse(doc?.legal || null) };
};

export const upsertAboutPage = async (payload, updatedBy, module = 'ALL') => {
    let m = String(module || 'ALL').toUpperCase();
    if (!['USER', 'DELIVERY', 'RESTAURANT', 'ALL'].includes(m)) {
        m = 'ALL';
    }
    const appName = decodeHtmlEntities(String(payload?.appName || '')).trim() || 'VersaPack';
    const version = decodeHtmlEntities(String(payload?.version || '')).trim() || '1.0.0';
    const description = decodeHtmlEntities(String(payload?.description || '')).trim();
    const logo = decodeHtmlEntities(String(payload?.logo || '')).trim();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const stats = Array.isArray(payload?.stats) ? payload.stats : [];

    const normalizedFeatures = features.map((f, idx) => ({
        icon: String(f?.icon || 'Heart'),
        title: String(f?.title || ''),
        description: String(f?.description || ''),
        color: String(f?.color || ''),
        bgColor: String(f?.bgColor || ''),
        order: Number.isFinite(Number(f?.order)) ? Number(f.order) : idx
    }));

    const aboutPayload = { appName, version, description, logo, features: normalizedFeatures, stats };

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: 'about', module: m },
        {
            $set: {
                key: 'about',
                module: m,
                about: aboutPayload,
                legal: undefined,
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            }
        },
        { upsert: true, new: true }
    ).lean();

    if (m === 'ALL' || m === 'USER') {
        await FoodPageContent.updateMany(
            { key: 'about' },
            {
                $set: {
                    about: aboutPayload,
                    updatedBy: updatedBy || null,
                    updatedByRole: 'ADMIN'
                }
            }
        );
    }

    return { key: 'about', module: m, data: normalizeAboutForResponse(doc?.about || null) };
};

