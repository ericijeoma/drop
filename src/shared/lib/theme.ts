// ────────────────────────────────────────────────────────────
// src/shared/lib/theme.ts
// Single source of truth for Drop's design tokens.
// Used by useTheme() hook and tailwind.config.js.
// ────────────────────────────────────────────────────────────


import { useColorScheme } from 'nativewind';

// ✅ Declare Theme interface with string values — not literals
// This allows light and dark themes to have different hex values
export interface Theme {
  background:      string;
  surface:         string;
  surfaceElevated: string;
  text:            string;
  textSecondary:   string;
  textTertiary:    string;
  brand:           string;
  brandLight:      string;
  brandDark:       string;
  danger:          string;
  dangerLight:     string;
  warning:         string;
  warningLight:    string;
  success:         string;
  successLight:    string;
  info:            string;
  infoLight:       string;
  border:          string;
  borderStrong:    string;
  mapOverlay:      string;
}

// ✅ Both typed as Theme — no as const, no typeof lightTheme
export const lightTheme: Theme = {
  background:      '#FFFFFF',
  surface:         '#F4F4F5',
  surfaceElevated: '#FAFAFA',
  text:            '#09090B',
  textSecondary:   '#71717A',
  textTertiary:    '#A1A1AA',
  brand:           '#16A34A',
  brandLight:      '#DCFCE7',
  brandDark:       '#15803D',
  danger:          '#EF4444',
  dangerLight:     '#FEE2E2',
  warning:         '#F59E0B',
  warningLight:    '#FEF3C7',
  success:         '#22C55E',
  successLight:    '#DCFCE7',
  info:            '#3B82F6',
  infoLight:       '#DBEAFE',
  border:          '#E4E4E7',
  borderStrong:    '#D4D4D8',
  mapOverlay:      'rgba(0,0,0,0.5)',
};

export const darkTheme: Theme = {
  background:      '#07080D',
  surface:         '#1A1B1F',
  surfaceElevated: '#22232A',
  text:            '#FAFAFA',
  textSecondary:   '#A1A1AA',
  textTertiary:    '#71717A',
  brand:           '#4ADE80',
  brandLight:      '#14532D',
  brandDark:       '#86EFAC',
  danger:          '#F87171',
  dangerLight:     '#450A0A',
  warning:         '#FCD34D',
  warningLight:    '#451A03',
  success:         '#4ADE80',
  successLight:    '#14532D',
  info:            '#60A5FA',
  infoLight:       '#1E3A5F',
  border:          '#27272A',
  borderStrong:    '#3F3F46',
  mapOverlay:      'rgba(0,0,0,0.7)',
};

export function useTheme(): Theme {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}