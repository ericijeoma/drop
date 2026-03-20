// ════════════════════════════════════════════════════════════
// DRIVER SCREENS
// ════════════════════════════════════════════════════════════

// src/app/(driver)/dashboard.tsx
import { useState, useCallback }  from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { useSafeAreaInsets }      from 'react-native-safe-area-context';
import { useMutation }            from '@tanstack/react-query';
import { useTheme }               from '@/shared/lib/theme';
import { useAuth }                from '@/shared/hooks/useAuth';
import { useDriverLocation }      from '@/shared/hooks/useDriverLocation';
import { ThemeToggle }            from '@/components/ThemeToggle';
import { UpdateDriverStatusUseCase } from '@/domains/driver/usecases/UpdateDriverStatusUseCase';
import { SupabaseDriverRepository }  from '@/shared/repositories/SupabaseDriverRepository';
import type { Coords }               from '@/shared/types';
import {styles}                      from '@/shared/styles';

const driverRepo = new SupabaseDriverRepository();
const useCase    = new UpdateDriverStatusUseCase(driverRepo);

export function DriverDashboardScreen() {
  const theme         = useTheme();
  const insets        = useSafeAreaInsets();
  const { user }      = useAuth();
  const [isOnline,    setIsOnline]    = useState(false);
  const [driverCoords, setDriverCoords] = useState<Coords | null>(null);

  useDriverLocation({
    driverId: user?.id ?? '',
    isOnline,
    onUpdate: useCallback((c: Coords) => setDriverCoords(c), []),
  });

  const toggleMutation = useMutation({
    mutationFn: (online: boolean) =>
      useCase.execute(user!.id, online ? 'online' : 'offline'),
    onSuccess: (_, online) => setIsOnline(online),
    onError: (e: Error) => { alert(e.message); },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.dashHeader}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>Welcome back</Text>
          <Text style={[styles.name, { color: theme.text }]} accessibilityRole="header">
            {user?.fullName || 'Driver'}
          </Text>
        </View>
        <ThemeToggle />
      </View>

      <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.statusRow}>
          <View>
            <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Status</Text>
            <Text style={[styles.statusValue, { color: isOnline ? theme.success : theme.textTertiary }]}>
              {toggleMutation.isPending ? 'Updating...' : isOnline ? 'Online — accepting rides' : 'Offline'}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
            trackColor={{ false: theme.border, true: theme.brandLight }}
            thumbColor={isOnline ? theme.brand : theme.textTertiary}
            accessible
            accessibilityRole="switch"
            accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
            accessibilityHint={isOnline ? 'Toggle to stop receiving ride requests' : 'Toggle to start receiving ride requests'}
          />
        </View>
        {driverCoords && (
          <Text style={[styles.coordsText, { color: theme.textTertiary }]}>
            Location: {driverCoords.lat.toFixed(4)}, {driverCoords.lng.toFixed(4)}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}


export default DriverDashboardScreen;