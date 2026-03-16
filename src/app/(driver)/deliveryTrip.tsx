// src/app/(driver)/delivery-trip.tsx
//
// Driver active delivery screen.
// Three phases: head to pickup → collect package → deliver and photograph.
// Camera integration for proof-of-delivery photo upload.
//
// File path: src/app/(driver)/delivery-trip.tsx

import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet,
  Alert, ActivityIndicator,
  AccessibilityInfo, Image,
}                                         from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets }              from 'react-native-safe-area-context';
import { useMutation, useQuery }          from '@tanstack/react-query';
import * as ImagePicker                   from 'expo-image-picker';
import { useTheme }                       from '@/shared/lib/theme';
import { useAuth }                        from '@/shared/hooks/useAuth';
import { useDriverLocation }              from '@/shared/hooks/useDriverLocation';
import { AccessibleRideMap }              from '@/components/Map/AccessibleRideMap';
import { PrimaryButton }                  from '@/components/Button/PrimaryButton';
import { ConfirmDeliveryUseCase }         from '@/domains/delivery/usecases/ConfirmDeliveryUseCase';
import { SupabaseOrderRepository }        from '@/shared/repositories/SupabaseOrderRepository';
import { SupabaseDriverRepository }       from '@/shared/repositories/SupabaseDriverRepository';
import { SupabasePaymentRepository }      from '@/shared/repositories/SupabasePaymentRepository';
import { supabase }                       from '@/shared/lib/supabase';
import { formatNaira }                    from '@/shared/utils/format';
import type { Coords }                    from '@/shared/types';

const orderRepo   = new SupabaseOrderRepository();
const driverRepo  = new SupabaseDriverRepository();
const paymentRepo = new SupabasePaymentRepository();
const useCase     = new ConfirmDeliveryUseCase(orderRepo, driverRepo, paymentRepo);

type DeliveryPhase = 'to_pickup' | 'to_dropoff' | 'confirming';

export default function DeliveryTripScreen() {
  const theme              = useTheme();
  const insets             = useSafeAreaInsets();
  const router             = useRouter();
  const { user }           = useAuth();
  const { orderId }        = useLocalSearchParams<{ orderId: string }>();
  const [phase, setPhase]  = useState<DeliveryPhase>('to_pickup');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [driverCoords, setDriverCoords] = useState<Coords | null>(null);

  // ── Fetch order ───────────────────────────────────────────
  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => orderId ? orderRepo.getById(orderId) : null,
    enabled:  !!orderId,
  });

  // ── Driver GPS ────────────────────────────────────────────
  useDriverLocation({
    driverId: user?.id ?? '',
    isOnline: true,
    onUpdate: useCallback((c: Coords) => setDriverCoords(c), []),
  });

  // ── Take proof photo ──────────────────────────────────────
  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Camera required',
        'Drop needs camera access to photograph proof of delivery.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:   ImagePicker.MediaTypeOptions.Images,
      quality:      0.7,    // compress for 3G upload
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      AccessibilityInfo.announceForAccessibility('Photo taken. Tap Confirm delivery to finish.');
    }
  };

  // ── Upload photo to Supabase Storage ─────────────────────
  const uploadPhoto = async (localUri: string): Promise<string> => {
    const response   = await fetch(localUri);
    const blob       = await response.blob();
    const ext        = localUri.split('.').pop() ?? 'jpg';
    const filename   = `deliveries/${orderId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('delivery-photos')
      .upload(filename, blob, { contentType: `image/${ext}`, upsert: false });

    if (error) throw new Error(`Photo upload failed: ${error.message}`);

    const { data } = supabase.storage
      .from('delivery-photos')
      .getPublicUrl(filename);

    return data.publicUrl;
  };

  // ── Confirm delivery mutation ─────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!photoUri) throw new Error('Please take a photo of the delivered package.');
      setUploading(true);
      const photoUrl = await uploadPhoto(photoUri);
      setUploading(false);
      await useCase.execute(orderId!, user!.id, photoUrl);
    },
    onSuccess: () => {
      AccessibilityInfo.announceForAccessibility('Delivery confirmed. Well done!');
      router.replace('/(driver)/dashboard');
    },
    onError: (e: Error) => {
      setUploading(false);
      Alert.alert('Confirmation failed', e.message);
    },
  });

  if (!order) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.brand} />
      </View>
    );
  }

  const targetCoords  = phase === 'to_pickup' ? order.pickupCoords : order.dropoffCoords;
  const targetAddress = phase === 'to_pickup' ? order.pickupAddress : order.dropoffAddress;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <AccessibleRideMap
          pickupCoords={order.pickupCoords}
          dropoffCoords={order.dropoffCoords}
          driverCoords={driverCoords}
          accessibilityLabel={
            phase === 'to_pickup'
              ? `Head to pickup at ${order.pickupAddress}`
              : `Deliver to ${order.dropoffAddress}`
          }
        />
      </View>

      {/* ── Bottom sheet ── */}
      <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom + 16 }]}>

        {/* Phase chip */}
        <View style={[styles.phaseChip, { backgroundColor: theme.brandLight }]}>
          <Text style={[styles.phaseText, { color: theme.brand }]}>
            {phase === 'to_pickup'  ? '📍 Go to pickup'
           : phase === 'to_dropoff' ? '🏍 Deliver package'
           :                          '📸 Confirm delivery'}
          </Text>
        </View>

        {/* Package description */}
        <View style={[styles.packageCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <Text style={[styles.packageLabel, { color: theme.textSecondary }]}>Package</Text>
          <Text style={[styles.packageDesc, { color: theme.text }]}>
            {order.packageDescription}
          </Text>
          <Text style={[styles.packageSize, { color: theme.textTertiary }]}>
            {order.packageSize} · {order.dropoffAddress}
          </Text>
        </View>

        {/* Earnings */}
        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: theme.textSecondary }]}>Your earnings</Text>
          <Text style={[styles.fareValue, { color: theme.brand }]}>
            {formatNaira(Math.round(order.fareAmount * 0.8))}
          </Text>
        </View>

        {/* Phase 1: Arrived at pickup */}
        {phase === 'to_pickup' && (
          <PrimaryButton
            label="Collected package"
            onPress={() => {
              setPhase('to_dropoff');
              AccessibilityInfo.announceForAccessibility('Package collected. Navigate to dropoff.');
            }}
            accessibilityHint="Confirm you have collected the package from the sender"
          />
        )}

        {/* Phase 2: Arrived at dropoff — take photo */}
        {phase === 'to_dropoff' && (
          <>
            <PrimaryButton
              label="Arrived at dropoff"
              onPress={() => setPhase('confirming')}
              accessibilityHint="Confirm you have arrived at the delivery address"
            />
          </>
        )}

        {/* Phase 3: Confirming — photo required */}
        {phase === 'confirming' && (
          <>
            <Text style={[styles.photoInstructions, { color: theme.textSecondary }]}>
              Take a photo of the delivered package as proof of delivery.
            </Text>

            {photoUri ? (
              <View accessible accessibilityLabel="Proof of delivery photo captured">
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoPreview}
                  accessibilityLabel="Delivery proof photo"
                />
                <PrimaryButton
                  label="Retake photo"
                  onPress={handleTakePhoto}
                  variant="ghost"
                  accessibilityHint="Take a new photo"
                />
              </View>
            ) : (
              <PrimaryButton
                label="Take photo"
                onPress={handleTakePhoto}
                accessibilityHint="Open camera to photograph the delivered package"
              />
            )}

            <PrimaryButton
              label={
                uploading                   ? 'Uploading photo...'
                : confirmMutation.isPending  ? 'Confirming...'
                :                             'Confirm delivery'
              }
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending || uploading}
              disabled={!photoUri || confirmMutation.isPending || uploading}
              accessibilityHint="Confirm the package has been delivered and submit the proof photo"
            />
          </>
        )}

        {/* Emergency cancel */}
        <PrimaryButton
          label="Cancel delivery"
          onPress={() => {
            Alert.alert(
              'Cancel this delivery?',
              'This will affect your rating.',
              [
                { text: 'Keep going', style: 'cancel' },
                {
                  text: 'Cancel',
                  style: 'destructive',
                  onPress: async () => {
                    await orderRepo.cancel(orderId!);
                    await driverRepo.updateStatus(user!.id, 'online');
                    router.replace('/(driver)/dashboard');
                  },
                },
              ]
            );
          }}
          variant="ghost"
          accessibilityHint="Cancel this delivery — only use in an emergency"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  loading:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer:       { flex: 1 },
  sheet:              { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, gap: 14 },
  phaseChip:          { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  phaseText:          { fontSize: 14, fontWeight: '600' },
  packageCard:        { padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
  packageLabel:       { fontSize: 12 },
  packageDesc:        { fontSize: 15, fontWeight: '500' },
  packageSize:        { fontSize: 12 },
  fareRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel:          { fontSize: 14 },
  fareValue:          { fontSize: 22, fontWeight: '700' },
  photoInstructions:  { fontSize: 14, lineHeight: 20 },
  photoPreview:       { width: '100%', height: 180, borderRadius: 12, marginBottom: 8, resizeMode: 'cover' },
});