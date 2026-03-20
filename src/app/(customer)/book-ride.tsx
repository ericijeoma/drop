// src/app/(customer)/book-ride.tsx — Booking screen
import { useState }           from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter }          from 'expo-router';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';
import { useTheme }           from '@/shared/lib/theme';
import { useAuth }            from '@/shared/hooks/useAuth';
import { useBookRide }        from '@/shared/hooks/useBookRide';
import { AddressInput }       from '@/components/Input/AddressInput';
import { PrimaryButton }      from '@/components/Button/PrimaryButton';
import type { AddressWithCoords , VehicleType } from '@/shared/types';
import {styles}               from '@/shared/styles';


export function BookRideScreen() {
  const theme   = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const bookRide = useBookRide();

  const [pickup,      setPickup]      = useState<AddressWithCoords | null>(null);
  const [dropoff,     setDropoff]     = useState<AddressWithCoords | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');

  const vehicles: { type: VehicleType; label: string; icon: string }[] = [
    { type: 'motorbike', label: 'Bike',  icon: '🏍' },
    { type: 'car',       label: 'Car',   icon: '🚗' },
    { type: 'van',       label: 'Van',   icon: '🚐' },
  ];

  const handleBook = () => {
    if (!pickup || !dropoff || !user) return;
    bookRide.mutate(
      {
        customerId:     user.id,
        vehicleType,
        pickupAddress:  pickup.address,
        dropoffAddress: dropoff.address,
        pickupCoords:   pickup.coords,
        dropoffCoords:  dropoff.coords,
      },
      {
        onSuccess: (result) => {
          router.push({ pathname: '/(customer)/track-ride', params: { rideId:  result.rideId } });
        },
        onError: (e: Error) => {
          Alert.alert('Booking failed', e.message);
        },
      }
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.bookContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.screenTitle, { color: theme.text }]} accessibilityRole="header">
        Book a ride
      </Text>

      <AddressInput
        label="Pickup"
        placeholder="Where are you?"
        onSelect={setPickup}
      />

      <AddressInput
        label="Dropoff"
        placeholder="Where are you going?"
        onSelect={setDropoff}
      />

      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Vehicle type</Text>
      <View style={styles.vehicleRow} accessibilityRole="radiogroup" accessibilityLabel="Select vehicle type">
        {vehicles.map(v => (
          <Pressable
            key={v.type}
            onPress={() => setVehicleType(v.type)}
            style={[
              styles.vehicleChip,
              { backgroundColor: theme.surface, borderColor: vehicleType === v.type ? theme.brand : theme.border },
            ]}
            accessible
            accessibilityRole="radio"
            accessibilityLabel={v.label}
            accessibilityState={{ checked: vehicleType === v.type }}
          >
            <Text style={styles.vehicleIcon}>{v.icon}</Text>
            <Text style={[styles.vehicleLabel, { color: vehicleType === v.type ? theme.brand : theme.text }]}>
              {v.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label={bookRide.isPending ? 'Finding driver...' : 'Book now'}
        onPress={handleBook}
        loading={bookRide.isPending}
        disabled={!pickup || !dropoff}
        accessibilityHint="Confirm your ride booking"
      />
    </ScrollView>
  );
}

export default BookRideScreen;
