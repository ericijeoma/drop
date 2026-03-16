// src/app/(customer)/track-ride.tsx
//
// Customer ride tracking screen.
// Shows live driver location on map.
// Triggers payment when ride status becomes 'completed'.
//
// File path: src/app/(customer)/track-ride.tsx

import { useState, useCallback }       from 'react';
import {
  View, Text, StyleSheet,
  ActivityIndicator, Alert,
  AccessibilityInfo,
}                                       from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets }            from 'react-native-safe-area-context';
import { useTheme }                     from '@/shared/lib/theme';
import { useActiveRide }                from '@/shared/hooks/useActiveRide';
import { usePayment }                   from '@/shared/hooks/usePayment';
import { AccessibleRideMap }            from '@/components/Map/AccessibleRideMap';
import { PayNowButton }                 from '@/components/Button/PayNowButton';
import { PrimaryButton }                from '@/components/Button/PrimaryButton';
import { formatNaira, formatDuration }  from '@/shared/utils/format';
import { getRoute }                     from '@/shared/utils/directions';
import { useQuery }                     from '@tanstack/react-query';
import type { Coords }                  from '@/shared/types';

export default function TrackRideScreen() {
  const theme                      = useTheme();
  const insets                     = useSafeAreaInsets();
  const router                     = useRouter();
  const { rideId }                  = useLocalSearchParams<{ rideId: string }>();
  const [driverCoords, setDriverCoords] = useState<Coords | null>(null);

  // ── Live ride data (Realtime + polling fallback) ──────────
  const { ride, isRealtime } = useActiveRide(rideId ?? null);

  // ── Route polyline ────────────────────────────────────────
  const { data: route } = useQuery({
    queryKey: ['route', ride?.pickupCoords, ride?.dropoffCoords],
    queryFn:  () => ride
      ? getRoute(ride.pickupCoords, ride.dropoffCoords)
      : null,
    enabled:  !!ride,
    staleTime: Infinity, // route does not change mid-trip
  });

  // ── Update driver coords from realtime ───────────────────
  // In production, driver coords come from the realtime subscription
  // on the drivers table. We pass them to the map here.
  // For now, ride.pickupCoords approximates driver position.
  const onDriverLocationUpdate = useCallback((coords: Coords) => {
    setDriverCoords(coords);
    AccessibilityInfo.announceForAccessibility(
      'Driver location updated'
    );
  }, []);

  // ── Payment ───────────────────────────────────────────────
  const { pay, isPaying, isComplete, error: paymentError } = usePayment({
    rideId:     rideId!,
    fareAmount: ride?.fareAmount ?? 0,
    onSuccess: () => {
      AccessibilityInfo.announceForAccessibility(
        'Payment successful. Thank you for riding with Drop.'
      );
      // Brief delay so the success state is visible before navigating
      setTimeout(() => router.replace('/(customer)/index'), 2000);
    },
    onError: (msg) => Alert.alert('Payment failed', msg),
  });

  // ── Loading state ─────────────────────────────────────────
  if (!ride) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
        accessible
        accessibilityLabel="Loading your ride details"
      >
        <ActivityIndicator size="large" color={theme.brand} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading ride...
        </Text>
      </View>
    );
  }

  // ── Ride status label and colour ──────────────────────────
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending:    { label: 'Finding your driver...',  color: theme.warning },
    active:     { label: 'Driver on the way',       color: theme.brand   },
    completed:  { label: 'Ride complete',           color: theme.success },
    cancelled:  { label: 'Ride cancelled',          color: theme.danger  },
    timed_out:  { label: 'No driver found',         color: theme.danger  },
  };
  const status = statusConfig[ride.status] ?? { label: ride.status, color: theme.textSecondary };

  // ── Driver ETA (rough calculation from distance) ─────────
  const etaSeconds = driverCoords
    ? undefined  // real ETA from OSRM would go here in production
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* ── Map (takes most of the screen) ── */}
      <View style={styles.mapContainer}>
        <AccessibleRideMap
          pickupCoords={ride.pickupCoords}
          dropoffCoords={ride.dropoffCoords}
          driverCoords={driverCoords}
          polyline={route?.polyline}
          accessibilityLabel={
            `Map showing your ride from ${ride.pickupAddress} to ${ride.dropoffAddress}. ` +
            `Status: ${status.label}.`
          }
        />

        {/* Realtime indicator — small pill at top of map */}
        {!isRealtime && (
          <View
            style={[styles.pollBadge, { backgroundColor: theme.warningLight }]}
            accessible
            accessibilityLabel="Live updates paused — using periodic refresh"
          >
            <Text style={[styles.pollBadgeText, { color: theme.warning }]}>
              ↻ Refreshing
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom sheet ── */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderColor: theme.border,
            paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text
            style={[styles.statusText, { color: status.color }]}
            accessible
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Ride status: ${status.label}`}
          >
            {status.label}
          </Text>
        </View>

        {/* Route summary */}
        <View style={styles.routeRow}>
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, { backgroundColor: theme.brand }]} />
            <Text
              style={[styles.routeAddress, { color: theme.text }]}
              numberOfLines={1}
              accessibilityLabel={`Pickup: ${ride.pickupAddress}`}
            >
              {ride.pickupAddress}
            </Text>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, { backgroundColor: theme.danger }]} />
            <Text
              style={[styles.routeAddress, { color: theme.text }]}
              numberOfLines={1}
              accessibilityLabel={`Dropoff: ${ride.dropoffAddress}`}
            >
              {ride.dropoffAddress}
            </Text>
          </View>
        </View>

        {/* Fare */}
        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: theme.textSecondary }]}>
            Fare
          </Text>
          <Text
            style={[styles.fareAmount, { color: theme.text }]}
            accessibilityLabel={`Fare: ${formatNaira(ride.fareAmount)}`}
          >
            {formatNaira(ride.fareAmount)}
          </Text>
        </View>

        {/* ETA if available */}
        {etaSeconds && (
          <Text
            style={[styles.eta, { color: theme.textSecondary }]}
            accessibilityLabel={`Estimated arrival: ${formatDuration(etaSeconds)}`}
          >
            ETA: {formatDuration(etaSeconds)}
          </Text>
        )}

        {/* Payment error */}
        {paymentError && (
          <Text
            style={[styles.errorText, { color: theme.danger }]}
            accessible
            accessibilityRole="alert"
          >
            {paymentError}
          </Text>
        )}

        {/* Payment success */}
        {isComplete && (
          <Text
            style={[styles.successText, { color: theme.success }]}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            Payment successful — thank you!
          </Text>
        )}

        {/* Pay button — only shown when ride is completed and not yet paid */}
        {ride.status === 'completed' && ride.paymentStatus === 'pending' && !isComplete && (
          <PayNowButton
            fareAmount={ride.fareAmount}
            onPress={pay}
            loading={isPaying}
            disabled={isPaying}
          />
        )}

        {/* Done button — only shown after payment or on terminal states */}
        {(isComplete || ride.status === 'cancelled' || ride.status === 'timed_out') && (
          <PrimaryButton
            label="Done"
            onPress={() => router.replace('/(customer)/index')}
            variant="ghost"
            accessibilityHint="Return to the home screen"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:    { fontSize: 15 },
  mapContainer:   { flex: 1, position: 'relative' },
  pollBadge:      { position: 'absolute', top: 12, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  pollBadgeText:  { fontSize: 12, fontWeight: '500' },
  sheet:          { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, gap: 14 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusText:     { fontSize: 15, fontWeight: '600' },
  routeRow:       { gap: 6 },
  routeItem:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeLine:      { width: 2, height: 16, marginLeft: 4 },
  routeAddress:   { flex: 1, fontSize: 14 },
  fareRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel:      { fontSize: 14 },
  fareAmount:     { fontSize: 22, fontWeight: '700' },
  eta:            { fontSize: 13, textAlign: 'center' },
  errorText:      { fontSize: 13, textAlign: 'center' },
  successText:    { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});