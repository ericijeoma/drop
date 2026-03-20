// ════════════════════════════════════════════════════════════
// CUSTOMER SCREENS
// ════════════════════════════════════════════════════════════

// src/app/(customer)/index.tsx — Home screen
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter }              from 'expo-router';
import { useSafeAreaInsets }      from 'react-native-safe-area-context';
import { useTheme }               from '@/shared/lib/theme';
import { useAuth }                from '@/shared/hooks/useAuth';
import { ThemeToggle }            from '@/components/ThemeToggle';
import {styles}                   from '@/shared/styles';

export function CustomerHomeScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.homeContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.homeHeader}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>Good day</Text>
          <Text style={[styles.name, { color: theme.text }]} accessibilityRole="header">
            {user?.fullName || 'Traveller'}
          </Text>
        </View>
        <ThemeToggle />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>What do you need?</Text>

      <Pressable
        style={[styles.serviceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => router.push('/(customer)/book-ride')}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Book a ride"
        accessibilityHint="Find a driver to take you to your destination"
      >
        <Text style={styles.serviceIcon}>🚗</Text>
        <View style={styles.serviceTextWrap}>
          <Text style={[styles.serviceTitle, { color: theme.text }]}>Book a ride</Text>
          <Text style={[styles.serviceDesc,  { color: theme.textSecondary }]}>
            Get picked up and dropped off anywhere
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.serviceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => router.push('/(customer)/send-package')}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Send a package"
        accessibilityHint="Send a package to any location"
      >
        <Text style={styles.serviceIcon}>📦</Text>
        <View style={styles.serviceTextWrap}>
          <Text style={[styles.serviceTitle, { color: theme.text }]}>Send a package</Text>
          <Text style={[styles.serviceDesc,  { color: theme.textSecondary }]}>
            Deliver packages quickly and safely
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={[styles.historyLink, { borderColor: theme.border }]}
        onPress={() => router.push('/(customer)/history')}
        accessible
        accessibilityRole="link"
        accessibilityLabel="View your trip history"
      >
        <Text style={[styles.historyText, { color: theme.brand }]}>View history →</Text>
      </Pressable>
    </ScrollView>
  );
}


export default CustomerHomeScreen;