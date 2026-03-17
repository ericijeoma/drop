// src/app/(customer)/track-delivery.tsx
//
// Customer delivery tracking screen.
// Shows live driver location and package status.
// Triggers payment when order status becomes 'delivered'.
//
// File path: src/app/(customer)/track-delivery.tsx
//
// NOTE: Uses the SAME usePayment hook as track-ride.tsx
// but passes { orderId } instead of { rideId }.
// The hook handles both identically.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/shared/lib/theme";
import { usePayment } from "@/shared/hooks/usePayment";
import { useRealtimeWithFallback } from "@/shared/hooks/useRealtimeWithFallback";
import { AccessibleRideMap } from "@/components/Map/AccessibleRideMap";
import { PayNowButton } from "@/components/Button/PayNowButton";
import { PrimaryButton } from "@/components/Button/PrimaryButton";
import { formatNaira } from "@/shared/utils/format";
import { SupabaseOrderRepository } from "@/shared/repositories/SupabaseOrderRepository";
import type { Order } from "@/domains/delivery/entities/Order";
import type { Coords } from "@/shared/types";

const orderRepo = new SupabaseOrderRepository();

export default function TrackDeliveryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [driverCoords, setDriverCoords] = useState<Coords | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  // ── Initial fetch ─────────────────────────────────────────
  const { isLoading, data: orderData } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => (orderId ? orderRepo.getById(orderId) : null),
    enabled: !!orderId,
  });

  useEffect(() => {
    if (orderData) setOrder(orderData);
  }, [orderData]);

  // ── Realtime subscription with polling fallback ───────────
  const fallbackQuery = useCallback(async () => {
    if (!orderId) return;
    const fresh = await orderRepo.getById(orderId);
    if (fresh) setOrder(fresh);
  }, [orderId]);

  // ── Memoized filters — stable references for useRealtimeWithFallback ──
const orderFilter = useMemo(
  () => orderId ? { column: 'id', value: orderId } : undefined,
  [orderId],
);

const driverFilter = useMemo(
  () => order?.driverId ? { column: 'id', value: order.driverId } : undefined,
  [order?.driverId],
);

  // ── Order status subscription ─────────────────────────────
  const { isRealtime } = useRealtimeWithFallback<Record<string, unknown>>({
    table: "orders",
    event: "UPDATE",
    filter: orderFilter,
    onData: () => fallbackQuery(),
    fallbackQuery,
    pollIntervalMs: 8_000,
  });

  // ── Driver location subscription ──────────────────────────
  // When the assigned driver's row updates in the drivers table,
  // extract their coordinates and push to the map.
  // Only subscribe once we know the order has a driver assigned.
  const driverLocationFallback = useCallback(async () => {
    if (!order?.driverId) return;
    // Location arrives via realtime — no REST fallback needed here
  }, [order?.driverId]);

  useRealtimeWithFallback<Record<string, unknown>>({
    table: "drivers",
    event: "UPDATE",
    filter: driverFilter,
    onData: useCallback((payload: Record<string, unknown>) => {
      // PostGIS returns GeoJSON: { type: 'Point', coordinates: [lng, lat] }
      const loc = payload.current_location as {
        type: string;
        coordinates: [number, number];
      } | null;
      if (loc?.type === "Point" && loc.coordinates.length === 2) {
        setDriverCoords({
          // ✅ setDriverCoords is now used here
          lng: loc.coordinates[0],
          lat: loc.coordinates[1],
        });
      }
    }, []),
    fallbackQuery: driverLocationFallback,
    pollIntervalMs: 8_000,
  });

  // ── Payment ───────────────────────────────────────────────
  // Identical hook call to track-ride.tsx — just orderId instead of rideId
  const {
    pay,
    isPaying,
    isComplete,
    error: paymentError,
  } = usePayment({
    orderId: orderId!,
    fareAmount: order?.fareAmount ?? 0,
    onSuccess: () => {
      AccessibilityInfo.announceForAccessibility(
        "Payment successful. Your package has been delivered.",
      );
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setTimeout(() => router.replace("/(customer)"), 2000);
    },
    onError: (msg) => Alert.alert("Payment failed", msg),
  });

  // ── Loading state ─────────────────────────────────────────
  if (isLoading || !order) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
        accessible
        accessibilityLabel="Loading your delivery details"
      >
        <ActivityIndicator size="large" color={theme.brand} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading delivery...
        </Text>
      </View>
    );
  }

  // ── Status config ─────────────────────────────────────────
  const statusConfig: Record<
    string,
    { label: string; color: string; icon: string }
  > = {
    pending: { label: "Finding a driver...", color: theme.warning, icon: "⏳" },
    assigned: {
      label: "Driver heading to pickup",
      color: theme.info,
      icon: "🏍",
    },
    in_transit: { label: "Package on the way", color: theme.brand, icon: "📦" },
    delivered: { label: "Package delivered", color: theme.success, icon: "✅" },
    cancelled: { label: "Delivery cancelled", color: theme.danger, icon: "❌" },
  };
  const status = statusConfig[order.status] ?? {
    label: order.status,
    color: theme.textSecondary,
    icon: "📦",
  };

  // ── Progress steps ────────────────────────────────────────
  const steps = [
    { key: "pending", label: "Order placed" },
    { key: "assigned", label: "Driver assigned" },
    { key: "in_transit", label: "In transit" },
    { key: "delivered", label: "Delivered" },
  ];
  const stepOrder = ["pending", "assigned", "in_transit", "delivered"];
  const currentStepIndex = stepOrder.indexOf(order.status);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <AccessibleRideMap
          pickupCoords={order.pickupCoords}
          dropoffCoords={order.dropoffCoords}
          driverCoords={driverCoords}
          accessibilityLabel={
            `Delivery map from ${order.pickupAddress} to ${order.dropoffAddress}. ` +
            `Status: ${status.label}.`
          }
        />

        {/* Realtime indicator */}
        {!isRealtime && (
          <View
            style={[styles.pollBadge, { backgroundColor: theme.warningLight }]}
            accessible
            accessibilityLabel="Using periodic refresh — live updates temporarily unavailable"
          >
            <Text style={[styles.pollBadgeText, { color: theme.warning }]}>
              ↻ Refreshing
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom sheet ── */}
      <ScrollView
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        contentContainerStyle={[
          styles.sheetContent,
          { paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status header */}
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon} accessibilityLabel="">
            {status.icon}
          </Text>
          <Text
            style={[styles.statusText, { color: status.color }]}
            accessible
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Delivery status: ${status.label}`}
          >
            {status.label}
          </Text>
        </View>

        {/* Progress bar */}
        {order.status !== "cancelled" && (
          <View
            style={styles.progressContainer}
            accessible
            accessibilityLabel={`Delivery progress: step ${currentStepIndex + 1} of ${steps.length}`}
          >
            {steps.map((step, index) => {
              const isDone = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <View key={step.key} style={styles.progressStep}>
                  <View
                    style={[
                      styles.progressDot,
                      {
                        backgroundColor: isDone ? theme.brand : theme.border,
                        borderColor: isCurrent ? theme.brand : "transparent",
                        borderWidth: isCurrent ? 2 : 0,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.progressLabel,
                      { color: isDone ? theme.text : theme.textTertiary },
                    ]}
                  >
                    {step.label}
                  </Text>
                  {index < steps.length - 1 && (
                    <View
                      style={[
                        styles.progressLine,
                        {
                          backgroundColor:
                            index < currentStepIndex
                              ? theme.brand
                              : theme.border,
                        },
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Route */}
        <View style={styles.routeRow}>
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, { backgroundColor: theme.brand }]} />
            <Text
              style={[styles.routeAddress, { color: theme.text }]}
              numberOfLines={1}
              accessibilityLabel={`Pickup: ${order.pickupAddress}`}
            >
              {order.pickupAddress}
            </Text>
          </View>
          <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
          <View style={styles.routeItem}>
            <View
              style={[styles.routeDot, { backgroundColor: theme.danger }]}
            />
            <Text
              style={[styles.routeAddress, { color: theme.text }]}
              numberOfLines={1}
              accessibilityLabel={`Dropoff: ${order.dropoffAddress}`}
            >
              {order.dropoffAddress}
            </Text>
          </View>
        </View>

        {/* Package info */}
        <View
          style={[
            styles.packageInfo,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.packageLabel, { color: theme.textSecondary }]}>
            Package
          </Text>
          <Text style={[styles.packageDesc, { color: theme.text }]}>
            {order.packageDescription}
          </Text>
          <Text style={[styles.packageSize, { color: theme.textTertiary }]}>
            {order.packageSize.charAt(0).toUpperCase() +
              order.packageSize.slice(1)}{" "}
            package
          </Text>
        </View>

        {/* Proof of delivery photo — shown after delivery */}
        {order.deliveryPhotoUrl && (
          <View
            style={[styles.photoContainer, { borderColor: theme.border }]}
            accessible
            accessibilityLabel="Proof of delivery photo is available"
          >
            <Text style={[styles.photoLabel, { color: theme.textSecondary }]}>
              Proof of delivery
            </Text>
            {/* In production render an <Image> here */}
            <Text
              style={[styles.photoUrl, { color: theme.info }]}
              numberOfLines={1}
            >
              Photo received ✓
            </Text>
          </View>
        )}

        {/* Fare */}
        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: theme.textSecondary }]}>
            Delivery fee
          </Text>
          <Text
            style={[styles.fareAmount, { color: theme.text }]}
            accessibilityLabel={`Delivery fee: ${formatNaira(order.fareAmount)}`}
          >
            {formatNaira(order.fareAmount)}
          </Text>
        </View>

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
            Payment successful — package delivered!
          </Text>
        )}

        {/* Pay button — shown when delivered but not yet paid */}
        {order.status === "delivered" &&
          order.paymentStatus === "pending" &&
          !isComplete && (
            <PayNowButton
              fareAmount={order.fareAmount}
              onPress={pay}
              loading={isPaying}
              disabled={isPaying}
            />
          )}

        {/* Done */}
        {(isComplete || order.status === "cancelled") && (
          <PrimaryButton
            label="Done"
            onPress={() => router.replace("/(customer)")}
            variant="ghost"
            accessibilityHint="Return to the home screen"
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 15 },
  mapContainer: { flex: 1, position: "relative" },
  pollBadge: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pollBadgeText: { fontSize: 12, fontWeight: "500" },
  sheet: {
    maxHeight: "55%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
  },
  sheetContent: { padding: 20, gap: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusIcon: { fontSize: 20 },
  statusText: { fontSize: 16, fontWeight: "600", flex: 1 },
  progressContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  progressStep: { alignItems: "center", flex: 1, position: "relative" },
  progressDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  progressLine: {
    position: "absolute",
    top: 5,
    left: "50%",
    right: "-50%",
    height: 2,
  },
  progressLabel: { fontSize: 10, textAlign: "center" },
  routeRow: { gap: 6 },
  routeItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeLine: { width: 2, height: 14, marginLeft: 4 },
  routeAddress: { flex: 1, fontSize: 14 },
  packageInfo: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
  packageLabel: { fontSize: 12 },
  packageDesc: { fontSize: 15, fontWeight: "500" },
  packageSize: { fontSize: 12 },
  photoContainer: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  photoLabel: { fontSize: 12 },
  photoUrl: { fontSize: 13 },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: { fontSize: 14 },
  fareAmount: { fontSize: 22, fontWeight: "700" },
  errorText: { fontSize: 13, textAlign: "center" },
  successText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
});
