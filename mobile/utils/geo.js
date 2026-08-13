// Distância aproximada em km entre duas coordenadas (mesma fórmula usada em Home.js
// para detectar zona segura — suficiente para distâncias curtas, sem custo de trig).
export function distanceKm(lat1, lon1, lat2, lon2) {
  return Math.sqrt(Math.pow((lat2 - lat1) * 111, 2) + Math.pow((lon2 - lon1) * 111, 2));
}

export function isInsideAnySafeZone(lat, lon, safeLocations, radiusKm = 0.08) {
  return (safeLocations || []).some((loc) => {
    const latSafe = Number(loc.latitude);
    const lonSafe = Number(loc.longitude);
    return distanceKm(lat, lon, latSafe, lonSafe) <= radiusKm;
  });
}
