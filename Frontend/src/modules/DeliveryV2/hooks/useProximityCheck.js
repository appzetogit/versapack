import { useMemo } from 'react';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { calculateDistance } from '@/modules/DeliveryV2/hooks/proximity.utils';

/**
 * useProximityCheck - Professional hook for dynamic range monitoring.
 * Ensures rider can only advance based on Admin-defined ranges.
 *
 * distanceToTarget = Haversine (meters) for geofence / auto-arrival.
 * displayDistanceMeters = road distance when Directions is available.
 *
 * @returns {Object} { distanceToTarget, displayDistanceMeters, isWithinRange, actionLimit, distanceLabel }
 */
export const useProximityCheck = () => {
  const riderLocation = useDeliveryStore((state) => state.riderLocation);
  const activeOrder = useDeliveryStore((state) => state.activeOrder);
  const tripStatus = useDeliveryStore((state) => state.tripStatus);
  const settings = useDeliveryStore((state) => state.settings);
  const routeDistanceMeters = useDeliveryStore((state) => state.routeDistanceMeters);

  const toPoint = (loc) => {
    if (!loc) return null;
    const lat = parseFloat(loc.lat ?? loc.latitude);
    const lng = parseFloat(loc.lng ?? loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  // Determine current target based on trip state
  const targetLocation = useMemo(() => {
    if (!activeOrder) return null;

    if (['PICKING_UP', 'REACHED_PICKUP'].includes(tripStatus)) {
      return toPoint(activeOrder.restaurantLocation || activeOrder.restaurant_location);
    }

    if (['PICKED_UP', 'REACHED_DROP'].includes(tripStatus)) {
      return toPoint(activeOrder.customerLocation || activeOrder.customer_location);
    }

    return null;
  }, [activeOrder, tripStatus]);

  // Determine current range limit from admin settings
  const actionLimit = useMemo(() => {
    if (tripStatus === 'PICKING_UP') return settings.pickupRangeLimit || 500;
    if (tripStatus === 'PICKED_UP') return settings.deliveryRangeLimit || 500;
    return 500;
  }, [tripStatus, settings]);

  // Haversine for proximity / geofence only
  const distanceToTarget = useMemo(() => {
    if (!riderLocation || !targetLocation) return Infinity;

    const rLat = parseFloat(riderLocation.lat ?? riderLocation.latitude);
    const rLng = parseFloat(riderLocation.lng ?? riderLocation.longitude);
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) return Infinity;

    return calculateDistance(rLat, rLng, targetLocation.lat, targetLocation.lng);
  }, [riderLocation, targetLocation]);

  /**
   * Stage-based DISPLAY distance (road when possible):
   * - Before pickup: delivery partner → restaurant (live Directions)
   * - After pickup: restaurant → user (tripDistanceKm road), else live road remaining to customer
   */
  const displayDistanceMeters = useMemo(() => {
    if (['PICKED_UP', 'REACHED_DROP'].includes(tripStatus)) {
      const roadTripKm = Number(
        activeOrder?.tripDistanceKm ?? activeOrder?.pricing?.roadDistanceKm,
      );
      // Fixed restaurant ↔ customer road trip after food is taken
      if (Number.isFinite(roadTripKm) && roadTripKm > 0) {
        return roadTripKm * 1000;
      }
    }

    if (routeDistanceMeters != null && Number.isFinite(routeDistanceMeters)) {
      return routeDistanceMeters;
    }

    return distanceToTarget;
  }, [tripStatus, activeOrder, routeDistanceMeters, distanceToTarget]);

  const distanceLabel = useMemo(() => {
    if (['PICKING_UP', 'REACHED_PICKUP'].includes(tripStatus)) return 'To restaurant';
    if (['PICKED_UP', 'REACHED_DROP'].includes(tripStatus)) return 'To customer';
    return 'Distance';
  }, [tripStatus]);

  // Dev mode bypass
  const isDevMode = import.meta.env.VITE_APP_MODE === 'developer' ||
                    import.meta.env.VITE_ENABLE_RANGE_BYPASS === 'true' ||
                    import.meta.env.DEV;

  const isWithinRange = isDevMode ? true : (distanceToTarget <= actionLimit);

  return {
    distanceToTarget,
    displayDistanceMeters,
    distanceLabel,
    isWithinRange,
    actionLimit,
  };
};
