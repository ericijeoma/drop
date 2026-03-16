// src/app/(driver)/ride-request.tsx
//
// Driver sees incoming ride request. Swipe right to accept, left to decline.
// 3-minute countdown timer — if not acted on, ride times out automatically.
// Uses RideRequestCard component with Reanimated worklets.
//
// File path: src/app/(driver)/ride-request.tsx

import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet,
  ActivityIndicator, AccessibilityInfo,
}                                       from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets }            from 'react-native-safe-area-context';
import { useMutation, useQuery }        from '@tanstack/react-query';
import { useTheme }                     from '@/shared/lib/theme';
import { useAuth }                      from '@/shared/hooks/useAuth';
import { RideRequestCard }              from '@/components/RideRequestCard';
import { AcceptRideUseCase }            from '@/domains/rides/usecases/AcceptRideUseCase';
import { SupabaseRideRepository }       from '@/shared/repositories/SupabaseRideRepository';
import { SupabaseDriverRepository }     from '@/shared/repositories/SupabaseDriverRepository';
import { RidePolicy }                   from '@/domains/rides/entities/RidePolicy';
import { formatDuration }               from '@/shared/utils/format';

const rideRepo   = new SupabaseRideRepository();
const driverRepo = new SupabaseDriverRepository();
const useCase    = new AcceptRideUseCase(rideRepo, driverRepo);

export default function RideRequestScreen() {
  const theme             = useTheme();
  const insets            = useSafeAreaInsets();
  const router            = useRouter();
  const { user }          = useAuth();
  const { rideId }        = useLocalSearchParams<{ rideId: string }>();
  const [secondsLeft, setSecondsLeft] = useState(
    RidePolicy.PENDING_TIMEOUT_MINUTES * 60
  );
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ride details ────────────────────────────────────
  const { data: ride, isLoading } = useQuery({
    queryKey: ['ride', rideId],
    queryFn:  () => rideId ? rideRepo.getById(rideId) : null,
    enabled:  !!rideId,
  });

  // ── Countdown timer ───────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Ride timed out — navigate away
          AccessibilityInfo.announceForAccessibility('Ride request expired');
          router.replace('/(driver)/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Announce countdown at 60s and 30s for screen reader users
  useEffect(() => {
    if (secondsLeft === 60 || secondsLeft === 30) {
      AccessibilityInfo.announceForAccessibility(
        `${secondsLeft} seconds remaining to respond`
      );
    }
  }, [secondsLeft]);

  // ── Accept mutation ───────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: () => useCase.execute(rideId!, user!.id),
    onSuccess: (result) => {
      if (timerRef.current) clearInterval(timerRef.current);
      AccessibilityInfo.announceForAccessibility('Ride accepted. Navigating to trip.');
      router.replace(`/(driver)/trip?rideId=${result.rideId}`);
    },
    onError: (e: Error) => {
      AccessibilityInfo.announceForAccessibility(e.message);
      router.replace('/(driver)/dashboard');
    },
  });

  // ── Decline ───────────────────────────────────────────────
  const handleDecline = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    AccessibilityInfo.announceForAccessibility('Ride declined');
    router.replace('/(driver)/dashboard');
  };

  // ── Loading ───────────────────────────────────────────────
  if (isLoading || !ride) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.brand} />
      </View>
    );
  }

  // Timer colour: green → amber → red as time runs out
  const timerColor = secondsLeft > 60 ? theme.success
                   : secondsLeft > 30 ? theme.warning
                   :                    theme.danger;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
    >
      {/* Countdown */}
      <View
        style={styles.timerRow}
        accessible
        accessibilityLabel={`${secondsLeft} seconds to respond`}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>
          Expires in
        </Text>
        <Text style={[styles.timerValue, { color: timerColor }]}>
          {formatDuration(secondsLeft)}
        </Text>
        {/* Visual progress bar */}
        <View style={[styles.timerTrack, { backgroundColor: theme.border }]}>
          <View style={[
            styles.timerFill,
            {
              backgroundColor: timerColor,
              width: `${(secondsLeft / (RidePolicy.PENDING_TIMEOUT_MINUTES * 60)) * 100}%`,
            },
          ]} />
        </View>
      </View>

      {/* Swipeable card */}
      <RideRequestCard
        pickupAddress={ride.pickupAddress}
        dropoffAddress={ride.dropoffAddress}
        fareAmount={ride.fareAmount}
        distanceKm={ride.distanceKm}
        durationSec={ride.distanceKm * 180}   // rough 3 min/km estimate
        vehicleType={ride.vehicleType}
        onAccept={() => acceptMutation.mutate()}
        onDecline={handleDecline}
      />

      {acceptMutation.isPending && (
        <View
          style={[styles.overlay, { backgroundColor: theme.background + 'CC' }]}
          accessible
          accessibilityLabel="Accepting ride, please wait"
        >
          <ActivityIndicator size="large" color={theme.brand} />
          <Text style={[styles.overlayText, { color: theme.text }]}>
            Accepting...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, paddingHorizontal: 20 },
  loading:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timerRow:    { alignItems: 'center', gap: 6, marginBottom: 24 },
  timerLabel:  { fontSize: 13 },
  timerValue:  { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timerTrack:  { width: '100%', height: 4, borderRadius: 2 },
  timerFill:   { height: 4, borderRadius: 2 },
  overlay:     { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 12 },
  overlayText: { fontSize: 16, fontWeight: '500' },
});