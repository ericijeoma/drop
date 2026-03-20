// ════════════════════════════════════════════════════════════
// ADMIN SCREENS
// ════════════════════════════════════════════════════════════

// src/app/(admin)/dashboard.tsx
import { View, Text, ScrollView} from 'react-native';
import { useSafeAreaInsets }                  from 'react-native-safe-area-context';
import { useTheme }                           from '@/shared/lib/theme';
import { useAuth }                            from '@/shared/hooks/useAuth';
import { useAdminStats }                      from '@/shared/hooks/useAdminStats';
import { ThemeToggle }                        from '@/components/ThemeToggle';
import { formatNaira }                        from '@/shared/utils/format';
import {styles}                               from '@/shared/styles';

export function AdminDashboardScreen() {
  const theme       = useTheme();
  const insets      = useSafeAreaInsets();
  const { user }    = useAuth();
  const { data: stats, isLoading } = useAdminStats(user?.id ?? '');

  const statCards = stats ? [
    { label: 'Active rides',   value: String(stats.active_rides),               color: theme.brand },
    { label: 'Active orders',  value: String(stats.active_orders),              color: theme.info },
    { label: 'Online drivers', value: String(stats.online_drivers),             color: theme.success },
    { label: 'Revenue today',  value: formatNaira(stats.revenue_today),         color: theme.warning },
    { label: 'Rides today',    value: String(stats.rides_today),                color: theme.brand },
    { label: 'Total users',    value: String(stats.total_users),                color: theme.textSecondary },
  ] : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.dashHeader}>
        <Text style={[styles.name, { color: theme.text }]} accessibilityRole="header">
          Admin Dashboard
        </Text>
        <ThemeToggle />
      </View>

      {isLoading ? (
        <Text style={[styles.loading, { color: theme.textSecondary }]}>Loading stats...</Text>
      ) : (
        <View style={styles.statsGrid}>
          {statCards.map((card) => (
            <View
              key={card.label}
              style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessible
              accessibilityLabel={`${card.label}: ${card.value}`}
            >
              <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{card.label}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}


export default AdminDashboardScreen;