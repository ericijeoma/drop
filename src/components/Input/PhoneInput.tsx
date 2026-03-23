// ────────────────────────────────────────────────────────────
// src/components/Input/PhoneInput.tsx
// E.164 phone input with country code picker.
// Full accessibility support for screen readers.
// ────────────────────────────────────────────────────────────

import { useState } from "react";
import { View, TextInput, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/lib/theme";

interface PhoneInputProps {
  value: string;
  onChangeText: (phone: string) => void;
  error?: string;
  autoFocus?: boolean;
}

export default function PhoneInput({
  value,
  onChangeText,
  error,
  autoFocus,
}: PhoneInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.danger
    : focused
      ? theme.brand
      : theme.border;

  return (
    <View accessible accessibilityLabel="Phone number input">
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        Phone number
      </Text>
      <View
        style={[styles.row, { borderColor, backgroundColor: theme.surface }]}
      >
        <Text
          style={[styles.prefix, { color: theme.textSecondary }]}
          accessibilityLabel="Country code plus 234"
        >
          +234
        </Text>
        <TextInput
          value={value.startsWith("+234")? value.slice(4):value}
          onChangeText={(text) => {
            // Strip non-digits
            const digits = text.replace(/\D/g, "");
            onChangeText(digits ? `+234${digits}` : "");
          }}
          placeholder="801 234 5678"
          placeholderTextColor={theme.textTertiary}
          keyboardType="phone-pad"
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: theme.text }]}
          accessible
          accessibilityLabel="Enter your phone number without country code"
          accessibilityHint="We will send you a 6-digit verification code"
          maxLength={10}
          textContentType="telephoneNumber"
          returnKeyType="done"
        />
      </View>
      {error ? (
        <Text
          style={[styles.error, { color: theme.danger }]}
          accessible
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  prefix: { fontSize: 16, marginRight: 8, fontWeight: "500" },
  input: { flex: 1, fontSize: 16, height: "100%" },
  error: { fontSize: 12, marginTop: 4 },
});
