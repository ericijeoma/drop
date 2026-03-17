// src/app/(driver)/delivery-request.tsx
//
// Driver sees incoming delivery request. Swipe right to accept, left to decline.
// Mirrors ride-request.tsx but for orders — uses the same RideRequestCard component.
//
// File path: src/app/(driver)/delivery-request.tsx

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
import { SupabaseOrderRepository }      from '@/shared/repositories/SupabaseOrderRepository';
import { SupabaseDriverRepository }     from '@/shared/repositories/SupabaseDriverRepository';
import { formatDuration }               from '@/shared/utils/format';

const orderRepo  = new SupabaseOrderRepository();
const driverRepo = new SupabaseDriverRepository();

const TIMEOUT_SECONDS = 5 * 60; // 5 minutes for deliveries

export default function DeliveryRequestScreen() {
  const theme             = useTheme();
  const insets            = useSafeAreaInsets();
  const router            = useRouter();
  const { user }          = useAuth();
  const { orderId }       = useLocalSearchParams<{ orderId: string }>();
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => orderId ? orderRepo.getById(orderId) : null,
    enabled:  !!orderId,
  });

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          AccessibilityInfo.announceForAccessibility('Delivery request expired');
          router.replace('/(driver)/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [router]);

  useEffect(() => {
    if (secondsLeft === 60 || secondsLeft === 30) {
      AccessibilityInfo.announceForAccessibility(`${secondsLeft} seconds remaining to respond`);
    }
  }, [secondsLeft]);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const driver = await driverRepo.getByUserId(user!.id);
      if (!driver) throw new Error('Driver profile not found');
      return orderRepo.acceptOrderAtomic(orderId!, driver.id);
    },
    onSuccess: (order) => {
      if (timerRef.current) clearInterval(timerRef.current);
      AccessibilityInfo.announceForAccessibility('Delivery accepted. Head to pickup.');
      router.replace(`/(driver)/delivery-trip?orderId=${order.id}`);
    },
    onError: (e: Error) => {
      AccessibilityInfo.announceForAccessibility(e.message);
      router.replace('/(driver)/dashboard');
    },
  });

  const handleDecline = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    router.replace('/(driver)/dashboard');
  };

  if (isLoading || !order) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.brand} />
      </View>
    );
  }

  const timerColor = secondsLeft > 60 ? theme.success
                   : secondsLeft > 30 ? theme.warning
                   :                    theme.danger;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.timerRow}>
        <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>Expires in</Text>
        <Text style={[styles.timerValue, { color: timerColor }]}>{formatDuration(secondsLeft)}</Text>
        <View style={[styles.timerTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.timerFill, { backgroundColor: timerColor, width: `${(secondsLeft / TIMEOUT_SECONDS) * 100}%` }]} />
        </View>
      </View>

      <View style={[styles.packageBadge, { backgroundColor: theme.infoLight }]}>
        <Text style={[styles.packageText, { color: theme.info }]}>
          📦 {order.packageSize.charAt(0).toUpperCase() + order.packageSize.slice(1)} package — {order.packageDescription}
        </Text>
      </View>

      <RideRequestCard
        pickupAddress={order.pickupAddress}
        dropoffAddress={order.dropoffAddress}
        fareAmount={order.fareAmount}
        distanceKm={order.distanceKm}
        durationSec={order.distanceKm * 180}
        vehicleType="motorbike"
        onAccept={() => acceptMutation.mutate()}
        onDecline={handleDecline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, paddingHorizontal: 20, gap: 16 },
  loading:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timerRow:     { alignItems: 'center', gap: 6 },
  timerLabel:   { fontSize: 13 },
  timerValue:   { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timerTrack:   { width: '100%', height: 4, borderRadius: 2 },
  timerFill:    { height: 4, borderRadius: 2 },
  packageBadge: { padding: 12, borderRadius: 12 },
  packageText:  { fontSize: 14, fontWeight: '500' },
});