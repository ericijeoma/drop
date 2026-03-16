// ────────────────────────────────────────────────────────────
// src/components/ThemeToggle.tsx
// Light/dark theme toggle button.
// Persisted via NativeWind's colorScheme.
// ────────────────────────────────────────────────────────────

import { Pressable, Text, StyleSheet } from 'react-native';
import { useColorScheme }              from 'nativewind';
import { useTheme }                    from '@/shared/lib/theme';

export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const theme                           = useTheme();
  const isDark                          = colorScheme === 'dark';

  return (
    <Pressable
      onPress={() => setColorScheme(isDark ? 'light' : 'dark')}
      style={[styles.toggle, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      accessibilityValue={{ text: isDark ? 'Dark mode on' : 'Light mode on' }}
    >
      <Text style={[styles.icon, { color: theme.text }]}>
        {isDark ? '☀️' : '🌙'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  icon: { fontSize: 18 },
});


