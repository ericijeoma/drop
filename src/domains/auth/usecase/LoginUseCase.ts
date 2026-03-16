// ────────────────────────────────────────────────────────────
// src/domains/auth/usecases/LoginUseCase.ts
// ────────────────────────────────────────────────────────────

import type { AuthRepository } from '../repositories/supabaseAuthRepository';
import { User }                from '../entities/User';
import { DomainError }         from '@/shared/types';

export class LoginUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async sendOtp(phone: string): Promise<void> {
    // Validate phone format before hitting Supabase
    try {
      User.create({
        id: 'temp', authId: 'temp', phone,
        fullName: '', avatarUrl: null,
        role: 'customer', isBanned: false, createdAt: new Date(),
      });
    } catch {
      throw new DomainError(
        'Please enter a valid phone number with country code (e.g. +2348012345678)',
        'INVALID_PHONE'
      );
    }
    await this.authRepository.sendOtp(phone);
  }

  async verifyOtp(phone: string, token: string): Promise<User> {
    if (!token || token.length !== 6) {
      throw new DomainError('OTP must be 6 digits.', 'INVALID_OTP');
    }
    const user = await this.authRepository.verifyOtp(phone, token);
    user.assertNotBanned();
    return user;
  }
}





