// src/app/(admin)/users.tsx
//
// Admin user management screen.
// List all users, search by phone, ban/unban with reason.
// Every admin action is recorded in admin_audit_log (immutable).
//
// File path: src/app/(admin)/users.tsx

import { useState }                    from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Pressable, TextInput,
  Alert, ActivityIndicator,
  AccessibilityInfo,
}                                       from 'react-native';
import { useSafeAreaInsets }           from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme }                    from '@/shared/lib/theme';
import { useAuth }                     from '@/shared/hooks/useAuth';
import { BanUserUseCase }              from '@/domains/admin/usecases/BanUserUseCase';
import { supabase }                    from '@/shared/lib/supabase';
import { formatDateTime, formatPhone } from '@/shared/utils/format';

const banUseCase = new BanUserUseCase();

const PAGE_SIZE = 20;

interface UserRow {
  id:         string;
  phone:      string;
  full_name:  string;
  role:       string;
  is_banned:  boolean;
  created_at: string;
}

export default function AdminUsersScreen() {
  const theme         = useTheme();
  const insets        = useSafeAreaInsets();
  const { user }      = useAuth();
  const queryClient   = useQueryClient();
  const [search, setSearch] = useState('');

  // ── Fetch users (paginated) ───────────────────────────────
  const usersQuery = useInfiniteQuery({
    queryKey: ['adminUsers', search],
    queryFn:  async ({ pageParam }) => {
      let query = supabase
        .from('users')
        .select('id, phone, full_name, role, is_banned, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (search.trim()) {
        query = query.ilike('phone', `%${search}%`);
      }
      if (pageParam) {
        query = query.lt('created_at', pageParam as string);
      }

      const { data, count } = await query;
      return {
        data:    (data ?? []) as UserRow[],
        total:   count ?? 0,
        hasMore: (data?.length ?? 0) === PAGE_SIZE,
        nextCursor: data && data.length > 0 ? data[data.length - 1]!.created_at : undefined,
      };
    },
    getNextPageParam: (last) => last.hasMore ? last.nextCursor : undefined,
    enabled: !!user?.isAdmin(),
    initialPageParam: undefined as string | undefined,
  });

  // ── Ban user mutation ─────────────────────────────────────
  const banMutation = useMutation({
    mutationFn: ({ targetId, reason }: { targetId: string; reason: string }) =>
      banUseCase.execute(user!.id, targetId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      AccessibilityInfo.announceForAccessibility('User banned successfully');
    },
    onError: (e: Error) => Alert.alert('Ban failed', e.message),
  });

  // ── Unban user ────────────────────────────────────────────
  const unbanMutation = useMutation({
    mutationFn: async ({ targetId }: { targetId: string }) => {
      const { error } = await supabase
        .from('users').update({ is_banned: false }).eq('id', targetId);
      if (error) throw error;
      // Audit log
      await supabase.from('admin_audit_log').insert({
        admin_id:    user!.id,
        action:      'unban_user',
        target_type: 'user',
        target_id:   targetId,
        metadata:    {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      AccessibilityInfo.announceForAccessibility('User unbanned');
    },
    onError: (e: Error) => Alert.alert('Unban failed', e.message),
  });

  const handleBan = (targetId: string, phone: string) => {
    Alert.prompt(
      'Ban user',
      `Enter the reason for banning ${formatPhone(phone)}:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: (reason: string | undefined) => {
            if (!reason?.trim()) {
              Alert.alert('Reason required', 'Please provide a ban reason.');
              return;
            }
            banMutation.mutate({ targetId, reason });
          },
        },
      ],
      'plain-text'
    );
  };

  const allUsers = usersQuery.data?.pages.flatMap(p => p.data) ?? [];

  const renderUser = ({ item }: { item: UserRow }) => {
    const roleColor = item.role === 'admin'  ? theme.warning
                    : item.role === 'driver' ? theme.info
                    :                          theme.brand;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: item.is_banned ? theme.dangerLight : theme.surface,
            borderColor:     item.is_banned ? theme.danger       : theme.border,
          },
        ]}
        accessible
        accessibilityLabel={
          `${item.full_name || 'No name'}, ${formatPhone(item.phone)}, ` +
          `${item.role}, ${item.is_banned ? 'banned' : 'active'}. ` +
          `Joined ${formatDateTime(new Date(item.created_at))}.`
        }
      >
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: theme.text }]}>
              {item.full_name || '—'}
            </Text>
            <Text style={[styles.userPhone, { color: theme.textSecondary }]}>
              {formatPhone(item.phone)}
            </Text>
            <Text style={[styles.userJoined, { color: theme.textTertiary }]}>
              Joined {formatDateTime(new Date(item.created_at))}
            </Text>
          </View>
          <View style={styles.badges}>
            <View style={[styles.rolePill, { backgroundColor: roleColor + '22' }]}>
              <Text style={[styles.rolePillText, { color: roleColor }]}>
                {item.role}
              </Text>
            </View>
            {item.is_banned && (
              <View style={[styles.rolePill, { backgroundColor: theme.dangerLight }]}>
                <Text style={[styles.rolePillText, { color: theme.danger }]}>banned</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action buttons — do not show for other admins */}
        {item.role !== 'admin' && (
          <View style={styles.actions}>
            {item.is_banned ? (
              <Pressable
                onPress={() => unbanMutation.mutate({ targetId: item.id })}
                style={[styles.actionButton, { borderColor: theme.success }]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Unban ${item.full_name || item.phone}`}
              >
                <Text style={[styles.actionText, { color: theme.success }]}>
                  Unban
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => handleBan(item.id, item.phone)}
                style={[styles.actionButton, { borderColor: theme.danger }]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Ban ${item.full_name || item.phone}`}
              >
                <Text style={[styles.actionText, { color: theme.danger }]}>
                  Ban
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* Search bar */}
      <View style={[styles.searchBar, { paddingTop: insets.top + 16, backgroundColor: theme.background }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by phone number..."
          placeholderTextColor={theme.textTertiary}
          style={[
            styles.searchInput,
            { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
          ]}
          accessible
          accessibilityLabel="Search users by phone number"
          keyboardType="phone-pad"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={[styles.totalText, { color: theme.textSecondary }]}>
          {usersQuery.data?.pages[0]?.total ?? 0} users
        </Text>
      </View>

      {/* User list */}
      {usersQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={allUsers}
          keyExtractor={u => u.id}
          renderItem={renderUser}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          onEndReached={() => usersQuery.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            usersQuery.isFetchingNextPage
              ? <ActivityIndicator size="small" color={theme.brand} style={{ margin: 16 }} />
              : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              No users found.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  searchBar:      { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  searchInput:    { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 15 },
  totalText:      { fontSize: 12 },
  list:           { paddingHorizontal: 16, gap: 10 },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:          { textAlign: 'center', marginTop: 40, fontSize: 15 },
  card:           { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  userHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  userInfo:       { flex: 1, gap: 3 },
  userName:       { fontSize: 15, fontWeight: '600' },
  userPhone:      { fontSize: 14 },
  userJoined:     { fontSize: 11 },
  badges:         { gap: 4, alignItems: 'flex-end' },
  rolePill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rolePillText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  actions:        { flexDirection: 'row', gap: 10 },
  actionButton:   { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  actionText:     { fontSize: 13, fontWeight: '600' },
});