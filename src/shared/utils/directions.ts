// ────────────────────────────────────────────────────────────
// src/shared/utils/directions.ts
// OSRM road routing — provides actual road distance and polyline.
// Uses the public OSRM demo server.
// For production: self-host or use a paid routing API.
// ────────────────────────────────────────────────────────────

import type { Coords } from '@/shared/types';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 8_000;

export interface RouteResult {
  readonly distanceKm:  number;
  readonly durationSec: number;
  readonly polyline:    Array<[number, number]>; // [lat, lng] pairs
}

/**
 * Fetch road route between two coordinates.
 * Falls back to straight-line distance + estimated duration on error.
 */
export async function getRoute(from: Coords, to: Coords): Promise<RouteResult> {
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM returned ${res.status}`);

    const data = await res.json() as {
      routes: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: Array<[number, number]> };
      }>;
    };

    const route = data.routes[0];
    if (!route) throw new Error('No route found');

    return {
      distanceKm:  route.distance / 1000,
      durationSec: route.duration,
      // GeoJSON coordinates are [lng, lat] — flip to [lat, lng] for react-native-maps
      polyline:    route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  } catch (error) {
    // Fallback: Haversine straight-line distance
    const straightLine = haversineKm(from, to);
    // Road distance is typically 1.3x straight-line in urban areas
    const estimatedRoad = straightLine * 1.3;
    const estimatedDurationSec = (estimatedRoad / 30) * 3600; // assume 30 km/h average

    return {
      distanceKm:  estimatedRoad,
      durationSec: estimatedDurationSec,
      polyline:    [[from.lat, from.lng], [to.lat, to.lng]],
    };
  }
}

/**
 * Haversine formula — straight-line distance between two GPS points.
 * Used as fallback when OSRM is unavailable.
 */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}


