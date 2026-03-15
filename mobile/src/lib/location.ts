// Haversine formula to calculate distance between two coordinates in meters
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Hardcoded Workplace Location (e.g., Cairo)
export const WORKPLACE_LOCATION = {
  lat: 30.0444,
  lng: 31.2357,
  radius: 50, // 50 meters allowed radius
};

export const isWithinWorkplace = (userLat: number, userLng: number): boolean => {
  const distance = calculateDistance(
    userLat,
    userLng,
    WORKPLACE_LOCATION.lat,
    WORKPLACE_LOCATION.lng
  );
  return distance <= WORKPLACE_LOCATION.radius;
};
