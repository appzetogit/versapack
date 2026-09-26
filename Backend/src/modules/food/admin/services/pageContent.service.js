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
    
    // 1. Try exact match on { key: k, module: m }
    let doc = await FoodPageContent.findOne({ key: k, module: m }).lean();
    
    // 2. Fallback to 'ALL' if specific module was requested but not found
    if (!doc && m !== 'ALL') {
        doc = await FoodPageContent.findOne({ key: k, module: 'ALL' }).lean();
    }
    
    // 3. Global Fallback: Find ANY document matching key: k (most recently updated first)
    if (!doc) {
        doc = await FoodPageContent.findOne({ key: k }).sort({ updatedAt: -1 }).lean();
    }

    if (!doc) {
        if (k === 'about') {
            return { key: k, module: m, data: DEFAULT_ABOUT_PAGE };
        }
        const fallback = DEFAULT_LEGAL_PAGES[k] || null;
        return { key: k, module: m, data: fallback };
    }

    if (k === 'about') {
        const aboutData = doc.about && (doc.about.appName || doc.about.description) ? doc.about : DEFAULT_ABOUT_PAGE;
        return { key: k, module: doc.module || m, data: normalizeAboutForResponse(aboutData) };
    }

    const legalData = doc.legal && (doc.legal.title || doc.legal.content) ? doc.legal : (DEFAULT_LEGAL_PAGES[k] || null);
    return { key: k, module: doc.module || m, data: normalizeLegalForResponse(legalData) };
};

export const getAdminPageByKey = async (key, module = 'ALL') => getPublicPageByKey(key, module);

export const upsertLegalPage = async (key, payload, updatedBy, module = 'ALL') => {
    const k = normalizeKey(key);
    let m = String(module || 'ALL').toUpperCase();
    if (!['USER', 'DELIVERY', 'RESTAURANT', 'ALL'].includes(m)) {
        m = 'ALL';
    }
    if (!['terms', 'privacy', 'refund', 'shipping', 'cancellation', 'support'].includes(k)) {
        throw new ValidationError('Invalid page key');
    }
    const title = String(payload?.title || '').trim();
    const content = decodeHtmlEntities(String(payload?.content || '')).trim();
    const email = String(payload?.email || '').trim();
    const mobile = String(payload?.mobile || '').trim();

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: k, module: m },
        {
            $set: {
                key: k,
                module: m,
                legal: { title, content, email, mobile },
                about: undefined,
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            }
        },
        { upsert: true, new: true }
    ).lean();

    return { key: k, module: m, data: normalizeLegalForResponse(doc?.legal || null) };
};

export const upsertAboutPage = async (payload, updatedBy, module = 'ALL') => {
    const m = String(module || 'ALL').toUpperCase();
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

    const doc = await FoodPageContent.findOneAndUpdate(
        { key: 'about', module: m },
        {
            $set: {
                key: 'about',
                module: m,
                about: { appName, version, description, logo, features: normalizedFeatures, stats },
                legal: undefined,
                updatedBy: updatedBy || null,
                updatedByRole: 'ADMIN'
            }
        },
        { upsert: true, new: true }
    ).lean();

    return { key: 'about', module: m, data: normalizeAboutForResponse(doc?.about || null) };
};

