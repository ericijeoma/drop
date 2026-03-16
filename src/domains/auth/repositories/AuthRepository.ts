// ────────────────────────────────────────────────────────────
// src/domains/auth/repositories/AuthRepository.ts
//
// Domain port — defines what the auth domain requires from
// any persistence/identity provider. No infrastructure
// concerns leak in here.
// ────────────────────────────────────────────────────────────

import type { User } from '@/domains/auth/entities/User';

/**
 * ProfileUpdates is a value object representing the subset of
 * User fields that a user may mutate post-registration.
 * Keeping it explicit (rather than Partial<User>) prevents
 * callers from accidentally passing immutable identity fields.
 */
export interface ProfileUpdates {
  fullName?: string;
  avatarUrl?: string;
}

/**
 * AuthRepository
 *
 * The single source of truth for authentication and user-identity
 * operations within the auth bounded context.
 *
 * Rules:
 *  - All methods are async; callers must handle rejection.
 *  - Nullable returns signal "not found" — never throw for absence.
 *  - Throw (or reject) only for genuine infrastructure/logic failures.
 */
export interface AuthRepository {

  // ── Queries ──────────────────────────────────────────────

  /**
   * Returns the currently authenticated User derived from the
   * active session, or null if no session exists.
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Looks up a user by their E.164-formatted phone number.
   * Returns null if no matching user exists.
   */
  getUserByPhone(phone: string): Promise<User | null>;

  /**
   * Looks up a user by their internal domain UUID.
   * Returns null if no matching user exists.
   */
  getUserById(id: string): Promise<User | null>;

  // ── Commands ─────────────────────────────────────────────

  /**
   * Dispatches a one-time password to the given phone number.
   * Throws on delivery failure or provider error.
   */
  sendOtp(phone: string): Promise<void>;

  /**
   * Verifies the OTP token against the given phone number.
   * On success, upserts the user record and returns the resolved User.
   * Throws if the token is invalid, expired, or provider rejects it.
   */
  verifyOtp(phone: string, token: string): Promise<User>;

  /**
   * Terminates the current session.
   * Implementations should degrade gracefully on network failure
   * (warn rather than throw) so the client-side session can still
   * be cleared.
   */
  signOut(): Promise<void>;

  /**
   * Applies a partial profile update to the user identified by userId.
   * Returns the updated User aggregate.
   * Throws if the user does not exist or the update fails.
   */
  updateProfile(userId: string, updates: ProfileUpdates): Promise<User>;
}