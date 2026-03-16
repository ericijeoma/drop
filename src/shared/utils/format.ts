// ────────────────────────────────────────────────────────────
// src/shared/utils/format.ts
// Display formatting — pure functions, no side effects.
// ────────────────────────────────────────────────────────────

import { formatDistanceToNow, format } from 'date-fns';

/**
 * Format naira amount for display.
 * e.g. 1500 → "₦1,500"
 */
export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

/**
 * Format km distance for display.
 * e.g. 0.8 → "800m", 5.3 → "5.3km"
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/**
 * Format duration in seconds to human readable.
 * e.g. 3661 → "1h 1min"
 */
export function formatDuration(seconds: number): string {
  const hours   = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

/**
 * Format a date as relative time.
 * e.g. "2 minutes ago"
 */
export function formatRelative(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format a date for display in history.
 * e.g. "14 Mar 2026, 3:45 PM"
 */
export function formatDateTime(date: Date): string {
  return format(date, "d MMM yyyy, h:mm a");
}

/**
 * Truncate a string with ellipsis.
 * e.g. truncate("Victoria Island, Lagos", 20) → "Victoria Island, Lag..."
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Format a phone number for display.
 * e.g. "+2348012345678" → "+234 801 234 5678"
 */
export function formatPhone(phone: string): string {
  if (!phone.startsWith('+')) return phone;
  const digits = phone.slice(1);
  const country = digits.slice(0, 3);
  const rest = digits.slice(3).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  return `+${country} ${rest}`;
}