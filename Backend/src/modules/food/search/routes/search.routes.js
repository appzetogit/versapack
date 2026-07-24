import express from 'express';
import { searchController, listAdminCategoriesController } from '../controllers/search.controller.js';
import { cacheResponse } from '../../../../middleware/cache.js';

const router = express.Router();

/**
 * Unified Search Endpoint
 * GET /api/v1/food/search/unified
 */
router.get('/unified', cacheResponse(120, 'search_unified', { browserTtlSeconds: 30 }), searchController);

/**
 * Admin Categories Only Endpoint (to avoid restaurant-created ones as requested)
 * GET /api/v1/food/search/categories/admin
 */
router.get('/categories/admin', cacheResponse(1800, 'search_categories_admin', { browserTtlSeconds: 300 }), listAdminCategoriesController);

export default router;
