// src/domains/auth/entities/User.ts
// Pure domain entity — zero external imports.
// Enforces all user-level business rules.

import type { UserRole } from '@/shared/types';
import { DomainError } from '@/shared/types';

export interface UserProps {
  readonly id: string;
  readonly authId: string;
  readonly phone: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly isBanned: boolean;
  readonly createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(props: UserProps): User {
    User.validatePhone(props.phone);
    return new User(props);
  }

  // ── Accessors ──────────────────────────────────────────────
  get id(): string        { return this.props.id; }
  get authId(): string    { return this.props.authId; }
  get phone(): string     { return this.props.phone; }
  get fullName(): string  { return this.props.fullName; }
  get avatarUrl(): string | null { return this.props.avatarUrl; }
  get role(): UserRole    { return this.props.role; }
  get isBanned(): boolean { return this.props.isBanned; }
  get createdAt(): Date   { return this.props.createdAt; }

  // ── Business rules ─────────────────────────────────────────

  isCustomer(): boolean { return this.props.role === 'customer'; }
  isDriver(): boolean   { return this.props.role === 'driver'; }
  isAdmin(): boolean    { return this.props.role === 'admin'; }

  assertNotBanned(): void {
    if (this.props.isBanned) {
      throw new DomainError(
        'Your account has been suspended. Please contact support.',
        'USER_BANNED'
      );
    }
  }

  assertIsCustomer(): void {
    if (!this.isCustomer()) {
      throw new DomainError(
        'Only customers can perform this action.',
        'NOT_CUSTOMER'
      );
    }
  }

  assertIsDriver(): void {
    if (!this.isDriver()) {
      throw new DomainError(
        'Only drivers can perform this action.',
        'NOT_DRIVER'
      );
    }
  }

  // ── Validation ─────────────────────────────────────────────

  private static validatePhone(phone: string): void {
    // E.164 format: +[country code][number], 7-15 digits total
    const e164 = /^\+[1-9]\d{6,14}$/;
    if (!e164.test(phone)) {
      throw new DomainError(
        'Phone number must be in E.164 format (e.g. +2348012345678)',
        'INVALID_PHONE'
      );
    }
  }

  // ── Serialization ──────────────────────────────────────────
  toJSON(): UserProps {
    return { ...this.props };
  }
}