import express from 'express';
import {
    listSellerZonesController,
    createSellerZoneController,
    updateSellerZoneController,
    activateSellerZoneController,
    deleteSellerZoneController
} from '../controllers/sellerZone.controller.js';

const router = express.Router();

router.get('/', listSellerZonesController);
router.post('/', createSellerZoneController);
router.put('/:zone_id', updateSellerZoneController);
router.patch('/:zone_id/activate', activateSellerZoneController);
router.delete('/:zone_id', deleteSellerZoneController);

export default router;
