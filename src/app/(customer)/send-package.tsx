// src/app/(customer)/send-package.tsx
//
// Customer delivery booking screen.
// Mirrors book-ride.tsx but collects package details instead of vehicle type.
//
// File path: src/app/(customer)/send-package.tsx

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { useTheme } from "@/shared/lib/theme";
import { useAuth } from "@/shared/hooks/useAuth";
import { AddressInput } from "@/components/Input/AddressInput";
import { PrimaryButton } from "@/components/Button/PrimaryButton";
import { PlaceOrderUseCase } from "@/domains/delivery/usecases/PlaceOrderUseCase";
import { SupabaseOrderRepository } from "@/shared/repositories/SupabaseOrderRepository";
import { SupabaseAuthRepository } from "@/shared/repositories/SupabaseAuthRepository";
import { SupabaseRideRepository } from "@/shared/repositories/SupabaseRideRepository";
import { CustomerActivityService } from "@/shared/services/CustomerActivityService";
import type { AddressWithCoords, PackageSize } from "@/shared/types";

const orderRepo = new SupabaseOrderRepository();
const authRepo = new SupabaseAuthRepository();
const activityService = new CustomerActivityService(
  new SupabaseRideRepository(),
  orderRepo,
);
const useCase = new PlaceOrderUseCase(orderRepo, authRepo, activityService);

const packageSizes: {
  size: PackageSize;
  label: string;
  desc: string;
  icon: string;
}[] = [
  { size: "small", label: "Small", desc: "Documents, envelopes", icon: "✉️" },
  { size: "medium", label: "Medium", desc: "Shoes, small box", icon: "📦" },
  { size: "large", label: "Large", desc: "Big box, appliance", icon: "🗃️" },
];

export default function SendPackageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [pickup, setPickup] = useState<AddressWithCoords | null>(null);
  const [dropoff, setDropoff] = useState<AddressWithCoords | null>(null);
  const [packageDesc, setPackageDesc] = useState("");
  const [packageSize, setPackageSize] = useState<PackageSize>("small");
  const [descError, setDescError] = useState("");

  const placeMutation = useMutation({
    mutationFn: () => {
      if (!packageDesc.trim()) {
        setDescError("Please describe the package");
        throw new Error("MISSING_DESC");
      }
      return useCase.execute({
        customerId: user!.id,
        pickupAddress: pickup!.address,
        dropoffAddress: dropoff!.address,
        pickupCoords: pickup!.coords,
        dropoffCoords: dropoff!.coords,
        packageDescription: packageDesc,
        packageSize,
      });
    },
    onSuccess: (result) => {
      router.replace(`/(customer)/track-delivery?orderId=${result.orderId}`);
    },
    onError: (e: Error) => {
      if (e.message !== "MISSING_DESC")
        Alert.alert("Could not place order", e.message);
    },
  });

  const isReady = !!pickup && !!dropoff && packageDesc.trim().length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[styles.title, { color: theme.text }]}
        accessibilityRole="header"
      >
        Send a package
      </Text>

      <AddressInput
        label="Pickup"
        placeholder="Where should we collect from?"
        onSelect={setPickup}
      />

      <AddressInput
        label="Dropoff"
        placeholder="Where should we deliver to?"
        onSelect={setDropoff}
      />

      {/* Package description */}
      <View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          What are you sending?
        </Text>

        <TextInput
          value={packageDesc}
          onChangeText={(t) => {
            setPackageDesc(t);
            setDescError("");
          }}
          placeholder="e.g. Documents, birthday cake, phone"
          placeholderTextColor={theme.textTertiary}
          style={[
            styles.descInput,
            {
              borderColor: descError ? theme.danger : theme.border,
              backgroundColor: theme.surface,
              color: theme.text,
            },
          ]}
          accessible
          accessibilityLabel="Package description"
          accessibilityHint="Describe what you are sending so the driver knows what to expect"
          maxLength={120}
          returnKeyType="done"
        />
        {descError ? (
          <Text
            style={[styles.error, { color: theme.danger }]}
            accessibilityRole="alert"
          >
            {descError}
          </Text>
        ) : null}
      </View>

      {/* Package size selector */}
      <View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Package size
        </Text>
        <View style={styles.sizeRow} accessibilityRole="radiogroup">
          {packageSizes.map(({ size, label, desc, icon }) => (
            <Pressable
              key={size}
              onPress={() => setPackageSize(size)}
              style={[
                styles.sizeCard,
                {
                  backgroundColor: theme.surface,
                  borderColor:
                    packageSize === size ? theme.brand : theme.border,
                  borderWidth: packageSize === size ? 2 : 1,
                },
              ]}
              accessible
              accessibilityRole="radio"
              accessibilityLabel={`${label} — ${desc}`}
              accessibilityState={{ checked: packageSize === size }}
            >
              <Text style={styles.sizeIcon}>{icon}</Text>
              <Text
                style={[
                  styles.sizeLabel,
                  { color: packageSize === size ? theme.brand : theme.text },
                ]}
              >
                {label}
              </Text>
              <Text style={[styles.sizeDesc, { color: theme.textTertiary }]}>
                {desc}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <PrimaryButton
        label={placeMutation.isPending ? "Finding driver..." : "Send package"}
        onPress={() => placeMutation.mutate()}
        loading={placeMutation.isPending}
        disabled={!isReady || placeMutation.isPending}
        accessibilityHint="Confirm and send your package"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 20 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 8 },
  descInput: {
    height: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  descText: { fontSize: 15 },
  error: { fontSize: 12, marginTop: 4 },
  sizeRow: { flexDirection: "row", gap: 10 },
  sizeCard: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 6,
  },
  sizeIcon: { fontSize: 24 },
  sizeLabel: { fontSize: 13, fontWeight: "600" },
  sizeDesc: { fontSize: 10, textAlign: "center", lineHeight: 14 },
});
