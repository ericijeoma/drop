// ────────────────────────────────────────────────────────────
// src/domains/admin/usecases/BanUserUseCase.ts
// ────────────────────────────────────────────────────────────

import { supabase }    from '@/shared/lib/supabase';
import { DomainError } from '@/shared/types';

export class BanUserUseCase {
  async execute(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
    if (!reason.trim()) {
      throw new DomainError('Ban reason is required.', 'MISSING_REASON');
    }

    const { error } = await supabase
      .from('users')
      .update({ is_banned: true })
      .eq('id', targetUserId);

    if (error) throw new DomainError('Failed to ban user.', 'BAN_FAILED');

    // Immutable audit log
    await supabase.from('admin_audit_log').insert({
      admin_id:    adminUserId,
      action:      'ban_user',
      target_type: 'user',
      target_id:   targetUserId,
      metadata:    { reason },
    });
  }
}