// ────────────────────────────────────────────────────────────
// src/components/Button/PayNowButton.tsx
// Stripe payment trigger button.
// ────────────────────────────────────────────────────────────

import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme }                    from '@/shared/lib/theme';
import { formatNaira }                 from '@/shared/utils/format';

interface PayNowButtonProps {
  fareAmount: number;
  onPress:    () => void;
  loading?:   boolean;
  disabled?:  boolean;
}

export function PayNowButton({ fareAmount, onPress, loading, disabled }: PayNowButtonProps) {
  const theme = useTheme();
  return (
    <PrimaryButton
      label={loading ? 'Processing...' : `Pay ${formatNaira(fareAmount)}`}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      accessibilityLabel={`Pay ${formatNaira(fareAmount)}`}
      accessibilityHint="Double tap to confirm payment for this ride"
    />
  );
}


