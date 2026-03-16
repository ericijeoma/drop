// ────────────────────────────────────────────────────────────
// src/shared/lib/theme.ts
// Single source of truth for Drop's design tokens.
// Used by useTheme() hook and tailwind.config.js.
// ────────────────────────────────────────────────────────────

import { useColorScheme } from 'nativewind';

export const lightTheme = {
  // Backgrounds
  background:          '#FFFFFF',
  surface:             '#F4F4F5',
  surfaceElevated:     '#FAFAFA',
  // Text
  text:                '#09090B',
  textSecondary:       '#71717A',
  textTertiary:        '#A1A1AA',
  // Brand
  brand:               '#16A34A',   // Drop green
  brandLight:          '#DCFCE7',
  brandDark:           '#15803D',
  // Status
  danger:              '#EF4444',
  dangerLight:         '#FEE2E2',
  warning:             '#F59E0B',
  warningLight:        '#FEF3C7',
  success:             '#22C55E',
  successLight:        '#DCFCE7',
  info:                '#3B82F6',
  infoLight:           '#DBEAFE',
  // Borders
  border:              '#E4E4E7',
  borderStrong:        '#D4D4D8',
  // Map
  mapOverlay:          'rgba(0,0,0,0.5)',
} as const;

export const darkTheme: typeof lightTheme = {
  background:          '#07080D',
  surface:             '#1A1B1F',
  surfaceElevated:     '#22232A',
  text:                '#FAFAFA',
  textSecondary:       '#A1A1AA',
  textTertiary:        '#71717A',
  brand:               '#4ADE80',
  brandLight:          '#14532D',
  brandDark:           '#86EFAC',
  danger:              '#F87171',
  dangerLight:         '#450A0A',
  warning:             '#FCD34D',
  warningLight:        '#451A03',
  success:             '#4ADE80',
  successLight:        '#14532D',
  info:                '#60A5FA',
  infoLight:           '#1E3A5F',
  border:              '#27272A',
  borderStrong:        '#3F3F46',
  mapOverlay:          'rgba(0,0,0,0.7)',
};

export type Theme = typeof lightTheme;

export function useTheme(): Theme {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}