// src/app/(driver)/trip.tsx
//
// Driver active ride screen.
// Three phases: heading to pickup → passenger on board → complete.
// Live map shows driver's current position and the target location.
//
// File path: src/app/(driver)/trip.tsx

import { useState, useCallback }       from 'react';
import {
  View, Text, StyleSheet,
  Alert, ActivityIndicator,
  AccessibilityInfo,
}                                       from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets }            from 'react-native-safe-area-context';
import { useMutation }                  from '@tanstack/react-query';
import { useTheme }                     from '@/shared/lib/theme';
import { useAuth }                      from '@/shared/hooks/useAuth';
import { useActiveRide }                from '@/shared/hooks/useActiveRide';
import { useDriverLocation }            from '@/shared/hooks/useDriverLocation';
import { AccessibleRideMap }            from '@/components/Map/AccessibleRideMap';
import { PrimaryButton }                from '@/components/Button/PrimaryButton';
import { CompleteRideUseCase }          from '@/domains/ride/usecases/CompleteRideUseCase';
import { SupabaseRideRepository }       from '@/shared/repositories/SupabaseRideRepository';
import { SupabaseDriverRepository }     from '@/shared/repositories/SupabaseDriverRepository';
import { SupabasePaymentRepository }    from '@/shared/repositories/SupabasePaymentRepository';
import { formatNaira }                  from '@/shared/utils/format';
import type { Coords }                  from '@/shared/types';

const rideRepo    = new SupabaseRideRepository();
const driverRepo  = new SupabaseDriverRepository();
const paymentRepo = new SupabasePaymentRepository();
const useCase     = new CompleteRideUseCase(rideRepo, driverRepo, paymentRepo);

// The trip has two phases from the driver's perspective
type TripPhase = 'to_pickup' | 'to_dropoff';

export default function TripScreen() {
  const theme              = useTheme();
  const insets             = useSafeAreaInsets();
  const router             = useRouter();
  const { user }           = useAuth();
  const { rideId }         = useLocalSearchParams<{ rideId: string }>();
  const [phase, setPhase]  = useState<TripPhase>('to_pickup');
  const [driverCoords, setDriverCoords] = useState<Coords | null>(null);

  // ── Live ride data ────────────────────────────────────────
  const { ride } = useActiveRide(rideId ?? null);

  // ── Driver GPS streaming ──────────────────────────────────
  useDriverLocation({
    driverId: user?.id ?? '',
    isOnline: true,
    onUpdate: useCallback((coords: Coords) => setDriverCoords(coords), []),
  });

  // ── Phase: arrived at pickup → start trip ─────────────────
  const handleArrivedAtPickup = () => {
    setPhase('to_dropoff');
    AccessibilityInfo.announceForAccessibility(
      'Passenger picked up. Navigate to dropoff location.'
    );
  };

  // ── Phase: complete trip ──────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: () => useCase.execute(rideId!, user!.id),
    onSuccess: () => {
      AccessibilityInfo.announceForAccessibility('Trip completed. Well done!');
      router.replace('/(driver)/dashboard');
    },
    onError: (e: Error) => {
      Alert.alert('Could not complete trip', e.message);
    },
  });

  // ── Loading ───────────────────────────────────────────────
  if (!ride) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.brand} />
      </View>
    );
  }

  // Which point to navigate toward depends on phase
  const targetAddress  = phase === 'to_pickup' ? ride.pickupAddress : ride.dropoffAddress;
  const phaseLabel     = phase === 'to_pickup'
    ? 'Head to pickup location'
    : 'Navigate to dropoff';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <AccessibleRideMap
          pickupCoords={ride.pickupCoords}
          dropoffCoords={ride.dropoffCoords}
          driverCoords={driverCoords}
          accessibilityLabel={
            `Trip map. ${phaseLabel}. Destination: ${targetAddress}.`
          }
        />
      </View>

      {/* ── Bottom sheet ── */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Phase indicator */}
        <View
          style={[styles.phaseChip, { backgroundColor: theme.brandLight }]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={phaseLabel}
        >
          <Text style={[styles.phaseText, { color: theme.brand }]}>
            {phase === 'to_pickup' ? '📍 Go to pickup' : '🏁 Go to dropoff'}
          </Text>
        </View>

        {/* Address */}
        <Text
          style={[styles.addressLabel, { color: theme.textSecondary }]}
          accessibilityLabel={`Destination: ${targetAddress}`}
        >
          {targetAddress}
        </Text>

        {/* Fare */}
        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: theme.textSecondary }]}>Your earnings</Text>
          <Text style={[styles.fareValue, { color: theme.brand }]}>
            {formatNaira(Math.round(ride.fareAmount * 0.8))}
          </Text>
        </View>

        {/* Action button changes by phase */}
        {phase === 'to_pickup' ? (
          <PrimaryButton
            label="Arrived at pickup"
            onPress={handleArrivedAtPickup}
            accessibilityHint="Confirm you have arrived at the passenger's pickup location"
          />
        ) : (
          <PrimaryButton
            label={completeMutation.isPending ? 'Completing...' : 'Complete trip'}
            onPress={() => {
              Alert.alert(
                'Complete trip?',
                'Only confirm after you have dropped off the passenger.',
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Yes, complete', onPress: () => completeMutation.mutate() },
                ]
              );
            }}
            loading={completeMutation.isPending}
            accessibilityHint="Confirm the passenger has been dropped off at their destination"
          />
        )}

        {/* Emergency cancel */}
        <PrimaryButton
          label="Cancel trip"
          onPress={() => {
            Alert.alert(
              'Cancel this trip?',
              'This will affect your rating. Only cancel in an emergency.',
              [
                { text: 'Keep trip', style: 'cancel' },
                {
                  text: 'Cancel',
                  style: 'destructive',
                  onPress: async () => {
                    await rideRepo.cancel(rideId!);
                    await driverRepo.updateStatus(user!.id, 'online');
                    router.replace('/(driver)/dashboard');
                  },
                },
              ]
            );
          }}
          variant="ghost"
          accessibilityHint="Cancel this trip — only use in an emergency"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  loading:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1 },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, gap: 14 },
  phaseChip:    { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  phaseText:    { fontSize: 14, fontWeight: '600' },
  addressLabel: { fontSize: 16, lineHeight: 22 },
  fareRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel:    { fontSize: 14 },
  fareValue:    { fontSize: 22, fontWeight: '700' },
});