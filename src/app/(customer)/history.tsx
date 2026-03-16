// src/app/(customer)/history.tsx
//
// Customer trip and delivery history screen.
// Paginated list of completed and cancelled rides and orders.
// Allows rating drivers after completed rides.
//
// File path: src/app/(customer)/history.tsx

import { useState }                    from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Pressable,
  ActivityIndicator, Alert,
}                                       from 'react-native';
import { useSafeAreaInsets }           from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useTheme }                    from '@/shared/lib/theme';
import { useAuth }                     from '@/shared/hooks/useAuth';
import { PrimaryButton }               from '@/components/Button/PrimaryButton';
import { SupabaseRideRepository }      from '@/shared/repositories/SupabaseRideRepository';
import { SupabaseOrderRepository }     from '@/shared/repositories/SupabaseOrderRepository';
import { RateDriverUseCase }           from '@/domains/rides/usecases/RateDriverUseCase';
import { formatNaira, formatDateTime, formatDistance } from '@/shared/utils/format';
import type { Ride }                   from '@/domains/rides/entities/Ride';
import type { Order }                  from '@/domains/delivery/entities/Order';

const rideRepo  = new SupabaseRideRepository();
const orderRepo = new SupabaseOrderRepository();
const rateUseCase = new RateDriverUseCase(rideRepo);

type HistoryTab = 'rides' | 'deliveries';

export default function HistoryScreen() {
  const theme         = useTheme();
  const insets        = useSafeAreaInsets();
  const { user }      = useAuth();
  const [tab, setTab] = useState<HistoryTab>('rides');
  const [ratingRideId, setRatingRideId] = useState<string | null>(null);

  // ── Rides history (paginated) ─────────────────────────────
  const ridesQuery = useInfiniteQuery({
    queryKey:      ['rideHistory', user?.id],
    queryFn:       ({ pageParam }) =>
      rideRepo.getHistoryForCustomer(user!.id, pageParam as string | undefined),
    getNextPageParam: (last) => last.hasMore ? last.nextCursor : undefined,
    enabled:       !!user && tab === 'rides',
    initialPageParam: undefined as string | undefined,
  });

  // ── Orders history (paginated) ────────────────────────────
  const ordersQuery = useInfiniteQuery({
    queryKey:      ['orderHistory', user?.id],
    queryFn:       ({ pageParam }) =>
      orderRepo.getHistoryForCustomer(user!.id, pageParam as string | undefined),
    getNextPageParam: (last) => last.hasMore ? last.nextCursor : undefined,
    enabled:       !!user && tab === 'deliveries',
    initialPageParam: undefined as string | undefined,
  });

  // ── Rate driver mutation ──────────────────────────────────
  const rateMutation = useMutation({
    mutationFn: ({ rideId, score }: { rideId: string; score: number }) =>
      rateUseCase.execute({ rideId, customerId: user!.id, score }),
    onSuccess: () => {
      setRatingRideId(null);
      Alert.alert('Thanks!', 'Your rating has been submitted.');
    },
    onError: (e: Error) => Alert.alert('Rating failed', e.message),
  });

  const rides  = ridesQuery.data?.pages.flatMap(p => p.data) ?? [];
  const orders = ordersQuery.data?.pages.flatMap(p => p.data) ?? [];
  const isLoading = tab === 'rides' ? ridesQuery.isLoading : ordersQuery.isLoading;

  // ── Render ride row ───────────────────────────────────────
  const renderRide = ({ item: ride }: { item: Ride }) => {
    const isCompleted = ride.status === 'completed';
    const statusColor = isCompleted ? theme.success : theme.danger;

    return (
      <View
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessible
        accessibilityLabel={
          `Ride on ${formatDateTime(ride.requestedAt)}. ` +
          `From ${ride.pickupAddress} to ${ride.dropoffAddress}. ` +
          `Fare: ${formatNaira(ride.fareAmount)}. Status: ${ride.status}.`
        }
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
            {formatDateTime(ride.requestedAt)}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {ride.status}
            </Text>
          </View>
        </View>

        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: theme.brand }]} />
          <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>
            {ride.pickupAddress}
          </Text>
        </View>
        <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: theme.danger }]} />
          <Text style={[styles.routeText, { color: theme.text }]} numberOfLines={1}>
            {ride.dropoffAddress}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.cardDistance, { color: theme.textSecondary }]}>
            {formatDistance(ride.distanceKm)}
          </Text>
          <Text style={[styles.cardFare, { color: theme.text }]}>
            {formatNaira(ride.fareAmount)}
          </Text>
        </View>

        {/* Rate driver — only for completed rides not yet rated */}
        {isCompleted && ratingRideId !== ride.id && (
          <Pressable
            onPress={() => setRatingRideId(ride.id)}
            style={[styles.rateButton, { borderColor: theme.brand }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Rate your driver"
          >
            <Text style={[styles.rateText, { color: theme.brand }]}>⭐ Rate driver</Text>
          </Pressable>
        )}

        {/* Star rating input */}
        {ratingRideId === ride.id && (
          <View style={styles.ratingRow} accessible accessibilityLabel="Select a rating from 1 to 5 stars">
            {[1, 2, 3, 4, 5].map(star => (
              <Pressable
                key={star}
                onPress={() => rateMutation.mutate({ rideId: ride.id, score: star })}
                disabled={rateMutation.isPending}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
              >
                <Text style={styles.star}>⭐</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  // ── Render order row ──────────────────────────────────────
  const renderOrder = ({ item: order }: { item: Order }) => {
    const isDelivered = order.status === 'delivered';
    const statusColor = isDelivered ? theme.success : theme.danger;

    return (
      <View
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessible
        accessibilityLabel={
          `Delivery on ${formatDateTime(order.requestedAt)}. ` +
          `Package: ${order.packageDescription}. ` +
          `Fare: ${formatNaira(order.fareAmount)}. Status: ${order.status}.`
        }
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
            {formatDateTime(order.requestedAt)}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {order.status}
            </Text>
          </View>
        </View>

        <Text style={[styles.packageDesc, { color: theme.text }]}>
          📦 {order.packageDescription}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={[styles.cardDistance, { color: theme.textSecondary }]}>
            {formatDistance(order.distanceKm)}
          </Text>
          <Text style={[styles.cardFare, { color: theme.text }]}>
            {formatNaira(order.fareAmount)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* Tab bar */}
      <View
        style={[styles.tabs, { borderBottomColor: theme.border, paddingTop: insets.top + 16 }]}
        accessibilityRole="tablist"
      >
        {(['rides', 'deliveries'] as HistoryTab[]).map(t => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tab,
              { borderBottomColor: tab === t ? theme.brand : 'transparent' },
            ]}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={t === 'rides' ? 'Rides tab' : 'Deliveries tab'}
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[
              styles.tabText,
              { color: tab === t ? theme.brand : theme.textSecondary },
            ]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.brand} />
        </View>
      ) : tab === 'rides' ? (
        <FlatList
          data={rides}
          keyExtractor={r => r.id}
          renderItem={renderRide}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          onEndReached={() => ridesQuery.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              No rides yet. Book your first ride!
            </Text>
          }
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={renderOrder}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          onEndReached={() => ordersQuery.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              No deliveries yet.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  tabs:             { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tab:              { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2 },
  tabText:          { fontSize: 15, fontWeight: '600' },
  list:             { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:            { textAlign: 'center', marginTop: 40, fontSize: 15 },
  card:             { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate:         { fontSize: 12 },
  statusPill:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusPillText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  routeRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:         { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  routeConnector:   { width: 2, height: 12, marginLeft: 3 },
  routeText:        { flex: 1, fontSize: 13 },
  packageDesc:      { fontSize: 14, fontWeight: '500' },
  cardFooter:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  cardDistance:     { fontSize: 13 },
  cardFare:         { fontSize: 18, fontWeight: '700' },
  rateButton:       { alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  rateText:         { fontSize: 14, fontWeight: '500' },
  ratingRow:        { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  star:             { fontSize: 28 },
});