// Distância aproximada em km entre duas coordenadas (equirretangular — suficiente para
// distâncias curtas, sem o custo da haversine completa). 1 grau de latitude ≈ 111 km em
// qualquer lugar, mas 1 grau de longitude encolhe com o cosseno da latitude: em São Paulo
// vale ~102 km, e ignorar isso estica as distâncias leste-oeste em ~9%.
export function distanceKm(lat1, lon1, lat2, lon2) {
  const latMedia = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const deltaLat = (lat2 - lat1) * 111;
  const deltaLon = (lon2 - lon1) * 111 * Math.cos(latMedia);
  return Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
}

export function isInsideAnySafeZone(lat, lon, safeLocations, radiusKm = 0.08) {
  return (safeLocations || []).some((loc) => {
    const latSafe = Number(loc.latitude);
    const lonSafe = Number(loc.longitude);
    return distanceKm(lat, lon, latSafe, lonSafe) <= radiusKm;
  });
}
