// Web stub — react-native-maps doesn't work on web
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/shared/lib/theme';
import type { Coords } from '@/shared/types';

interface AccessibleRideMapProps {
  pickupCoords:     Coords;
  dropoffCoords:    Coords;
  driverCoords?:    Coords | null;
  polyline?:        [number, number][];
  driverDistanceM?: number;
  accessibilityLabel?: string;
}

export function AccessibleRideMap({
  pickupCoords,
  dropoffCoords,
  driverCoords,
  accessibilityLabel,
}: AccessibleRideMapProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      <Text style={[styles.icon]}>🗺️</Text>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {accessibilityLabel ?? 'Map preview not available on web'}
      </Text>
      <Text style={[styles.coords, { color: theme.textTertiary }]}>
        Pickup: {pickupCoords.lat.toFixed(4)}, {pickupCoords.lng.toFixed(4)}
      </Text>
      <Text style={[styles.coords, { color: theme.textTertiary }]}>
        Dropoff: {dropoffCoords.lat.toFixed(4)}, {dropoffCoords.lng.toFixed(4)}
      </Text>
      {driverCoords && (
        <Text style={[styles.coords, { color: theme.info }]}>
          Driver: {driverCoords.lat.toFixed(4)}, {driverCoords.lng.toFixed(4)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  icon:   { fontSize: 40 },
  label:  { fontSize: 14, textAlign: 'center' },
  coords: { fontSize: 12 },
});