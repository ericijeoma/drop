// ────────────────────────────────────────────────────────────
// src/shared/repositories/SupabaseAuthRepository.ts
// ────────────────────────────────────────────────────────────

import { supabase } from '@/shared/lib/supabase';
import { User } from '@/domains/auth/entities/User';
import type { AuthRepository, ProfileUpdates } from '@/domains/auth/repositories/AuthRepository';
import { logger } from '@/shared/lib/logger';

function toUser(row: Record<string, unknown>): User {
  return User.create({
    id:        row.id as string,
    authId:    row.auth_id as string,
    phone:     row.phone as string,
    fullName:  row.full_name as string,
    avatarUrl: row.avatar_url as string | null,
    role:      row.role as 'customer' | 'driver' | 'admin',
    isBanned:  row.is_banned as boolean,
    createdAt: new Date(row.created_at as string),
  });
}

export class SupabaseAuthRepository implements AuthRepository {

  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();
    if (error || !data) return null;
    return toUser(data);
  }

  async getUserByPhone(phone: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (error || !data) return null;
    return toUser(data);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toUser(data);
  }

  async sendOtp(phone: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }

  async verifyOtp(phone: string, token: string): Promise<User> {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error || !data.user) throw error ?? new Error('OTP verification failed');

    // Upsert user record (may be first login)
    const { data: userRow, error: upsertError } = await supabase
      .from('users')
      .upsert({
        auth_id:  data.user.id,
        phone,
        role:     'customer',
      }, { onConflict: 'auth_id' })
      .select()
      .single();

    if (upsertError || !userRow) throw upsertError ?? new Error('Failed to create user record');
    return toUser(userRow);
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) logger.warn('signOut error', { error: error.message });
  }

  async updateProfile(
    userId: string,
    updates: ProfileUpdates
  ): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({
        full_name:  updates.fullName,
        avatar_url: updates.avatarUrl,
      })
      .eq('id', userId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Failed to update profile');
    return toUser(data);
  }
}