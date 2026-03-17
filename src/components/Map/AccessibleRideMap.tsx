// ────────────────────────────────────────────────────────────
// src/components/Map/AccessibleRideMap.tsx
// Interactive map for tracking rides and deliveries.
// Accessible: announces driver ETA and location changes to screen readers.
// ────────────────────────────────────────────────────────────

import { useRef, useEffect }                                         from 'react';
import { View, StyleSheet, AccessibilityInfo }                       from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region }  from 'react-native-maps';
import { useTheme, darkTheme }                                                  from '@/shared/lib/theme';
import { formatDistance }                                            from '@/shared/utils/format';
import type { Coords }                                               from '@/shared/types';

interface AccessibleRideMapProps {
  pickupCoords:    Coords;
  dropoffCoords:   Coords;
  driverCoords?:   Coords | null;
  polyline?:       [number, number][];
  driverDistanceM?: number;
  accessibilityLabel?: string;
}

export function AccessibleRideMap({
  pickupCoords,
  dropoffCoords,
  driverCoords,
  polyline,
  driverDistanceM,
  accessibilityLabel,
}: AccessibleRideMapProps) {
  const theme      = useTheme();
  const mapRef     = useRef<MapView>(null);
  const prevEtaRef = useRef<number | null>(null);

  // Announce driver location changes to screen readers
  useEffect(() => {
    if (driverDistanceM == null) return;
    const newEta = Math.round(driverDistanceM / 500 * 60); // rough ETA in seconds
    if (prevEtaRef.current !== newEta) {
      prevEtaRef.current = newEta;
      AccessibilityInfo.announceForAccessibility(
        `Driver is ${formatDistance(driverDistanceM / 1000)} away`
      );
    }
  }, [driverDistanceM]);

  // Fit map to show all relevant markers
  useEffect(() => {
    if (!mapRef.current) return;
    const coords = [pickupCoords, dropoffCoords];
    if (driverCoords) coords.push(driverCoords);
    mapRef.current.fitToCoordinates(
      coords.map(c => ({ latitude: c.lat, longitude: c.lng })),
      { edgePadding: { top: 60, right: 40, bottom: 60, left: 40 }, animated: true }
    );
  }, [driverCoords, dropoffCoords, pickupCoords]);

  const mapRegion: Region = {
    latitude:       pickupCoords.lat,
    longitude:      pickupCoords.lng,
    latitudeDelta:  0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        (driverDistanceM
          ? `Map showing your ride. Driver is ${formatDistance(driverDistanceM / 1000)} away.`
          : 'Map showing your ride route.')
      }
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
        customMapStyle={theme === darkTheme ? darkMapStyle : []}
        showsUserLocation
        showsMyLocationButton={false}
        accessible={false}  // MapView itself is not screen-reader navigable — container handles it
      >
        {/* Pickup marker */}
        <Marker
          coordinate={{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }}
          pinColor={theme.brand}
          accessible
          accessibilityLabel="Pickup location"
        />

        {/* Dropoff marker */}
        <Marker
          coordinate={{ latitude: dropoffCoords.lat, longitude: dropoffCoords.lng }}
          pinColor={theme.danger}
          accessible
          accessibilityLabel="Dropoff destination"
        />

        {/* Driver marker */}
        {driverCoords && (
          <Marker
            coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lng }}
            accessible
            accessibilityLabel={`Driver location, ${formatDistance((driverDistanceM ?? 0) / 1000)} away`}
          >
            <View style={[styles.driverDot, { backgroundColor: theme.info }]} />
          </Marker>
        )}

        {/* Route polyline */}
        {polyline && polyline.length > 1 && (
          <Polyline
            coordinates={polyline.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
            strokeColor={theme.brand}
            strokeWidth={3}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  map:       { flex: 1 },
  driverDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
});

// Minimal dark map style
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a1b1f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a1a1aa' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#07080d' }] },
];


