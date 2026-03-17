// ────────────────────────────────────────────────────────────
// src/components/Button/PayNowButton.tsx
// Stripe payment trigger button.
// ────────────────────────────────────────────────────────────

import { formatNaira } from "@/shared/utils/format";
import { PrimaryButton } from "./PrimaryButton";

interface PayNowButtonProps {
  fareAmount: number;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function PayNowButton({
  fareAmount,
  onPress,
  loading,
  disabled,
}: PayNowButtonProps) {
  
  return (
    <PrimaryButton
      label={loading ? "Processing..." : `Pay ${formatNaira(fareAmount)}`}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      accessibilityLabel={`Pay ${formatNaira(fareAmount)}`}
      accessibilityHint="Double tap to confirm payment for this ride"
    />
  );
}
