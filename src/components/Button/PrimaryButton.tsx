// src/components/Button/PrimaryButton.tsx
// Reusable button with loading state, accessibility, and theme support.

import { Pressable, Text, ActivityIndicator, StyleSheet, AccessibilityRole } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/shared/lib/theme';

interface PrimaryButtonProps {
  label:          string;
  onPress:        () => void;
  loading?:       boolean;
  disabled?:      boolean;
  variant?:       'primary' | 'danger' | 'ghost';
  accessibilityLabel?: string;
  accessibilityHint?:  string;
}

export default function PrimaryButton({
  label,
  onPress,
  loading  = false,
  disabled = false,
  variant  = 'primary',
  accessibilityLabel,
  accessibilityHint,
}: PrimaryButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColor = {
    primary: theme.brand,
    danger:  theme.danger,
    ghost:   'transparent',
  }[variant];

  const textColor = variant === 'ghost' ? theme.brand : '#FFFFFF';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        disabled={disabled || loading}
        accessible
        accessibilityRole={'button' as AccessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={[
          styles.base,
          { backgroundColor: bgColor, borderColor: bgColor },
          variant === 'ghost' && { borderWidth: 1.5, borderColor: theme.brand },
          (disabled || loading) && { opacity: 0.5 },
        ]}
      >
        {loading
          ? <ActivityIndicator color={textColor} size="small" />
          : <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        }
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height:         52,
    borderRadius:   14,
    justifyContent: 'center',
    alignItems:     'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize:   16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});


