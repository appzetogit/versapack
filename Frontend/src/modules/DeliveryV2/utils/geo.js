/**
 * Haversine formula to calculate the distance between two points in meters.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
export const getHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth Radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * Calculates accurate ETA in minutes based on distance and rolling average speed.
 * @param {number} distanceInMeters 
 * @param {number} averageSpeedMetersPerSec 
 * @returns {number} ETA in minutes (minimum 1)
 */
export const calculateETA = (distanceInMeters, averageSpeedMetersPerSec) => {
    if (!distanceInMeters || distanceInMeters <= 0) return 0;
    // Fallback speed if stationary/low speed (avg human biking speed 4.5m/s approx 16km/h)
    const speed = averageSpeedMetersPerSec > 1 ? averageSpeedMetersPerSec : 4.5;
    const seconds = distanceInMeters / speed;
    return Math.max(1, Math.round(seconds / 60));
};
/**
 * Calculates the bearing (heading) between two points in degrees.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Angle in degrees [0, 360)
 */
export const calculateHeading = (lat1, lon1, lat2, lon2) => {
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const deltaLonRad = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);
    
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
};

/**
 * Normalize any common lat/lng shape to { lat, lng }.
 */
export const toLatLng = (point) => {
    if (!point || typeof point !== 'object') return null;
    const lat = parseFloat(point.lat ?? point.latitude);
    const lng = parseFloat(point.lng ?? point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
};

/**
 * Driving (road) distance via Google Maps JS DirectionsService.
 * Returns null when Maps JS is not loaded or the route cannot be resolved.
 * @returns {Promise<{ distanceMeters: number, durationSeconds: number, distanceKm: number } | null>}
 */
export const fetchDrivingRouteClient = (origin, destination) =>
    new Promise((resolve) => {
        const from = toLatLng(origin);
        const to = toLatLng(destination);
        if (!from || !to || !window.google?.maps?.DirectionsService) {
            resolve(null);
            return;
        }

        const service = new window.google.maps.DirectionsService();
        service.route(
            {
                origin: from,
                destination: to,
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status !== 'OK' || !result?.routes?.[0]?.legs?.length) {
                    resolve(null);
                    return;
                }

                let distanceMeters = 0;
                let durationSeconds = 0;
                for (const leg of result.routes[0].legs) {
                    distanceMeters += leg.distance?.value || 0;
                    durationSeconds += leg.duration?.value || 0;
                }

                if (distanceMeters <= 0) {
                    resolve(null);
                    return;
                }

                resolve({
                    distanceMeters,
                    durationSeconds,
                    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
                });
            },
        );
    });

