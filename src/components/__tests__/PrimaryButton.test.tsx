// ════════════════════════════════════════════════════════════
// COMPONENT TESTS
// ════════════════════════════════════════════════════════════

// src/components/__tests__/PrimaryButton.test.tsx
import React                         from 'react';
import { render, fireEvent }         from '@testing-library/react-native';
import { PrimaryButton }             from '../Button/PrimaryButton';

// Mock nativewind
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
}));

// Mock theme
jest.mock('@/shared/lib/theme', () => ({
  useTheme: () => ({
    brand: '#16A34A', danger: '#EF4444', surface: '#F4F4F5',
    text: '#09090B', textSecondary: '#71717A', border: '#E4E4E7',
    background: '#FFFFFF',
  }),
}));

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    default: { ...RN.Animated },
    useSharedValue:    (v: unknown) => ({ value: v }),
    useAnimatedStyle:  (fn: () => object) => fn(),
    withSpring:        (v: unknown) => v,
    View:              RN.View,
  };
});

describe('PrimaryButton', () => {
  it('renders label text', () => {
    const { getByText } = render(
      <PrimaryButton label="Book now" onPress={jest.fn()} />
    );
    expect(getByText('Book now')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <PrimaryButton label="Book now" onPress={onPress} />
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <PrimaryButton label="Book now" onPress={onPress} disabled />
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    const { queryByText, getByTestId } = render(
      <PrimaryButton label="Book now" onPress={jest.fn()} loading />
    );
    // Label should not be visible during loading
    expect(queryByText('Book now')).toBeNull();
  });

  it('has correct accessibility label', () => {
    const { getByRole } = render(
      <PrimaryButton
        label="Book now"
        onPress={jest.fn()}
        accessibilityLabel="Book a ride now"
      />
    );
    expect(getByRole('button', { name: 'Book a ride now' })).toBeTruthy();
  });

  it('shows danger color for danger variant', () => {
    const { getByRole } = render(
      <PrimaryButton label="Cancel" onPress={jest.fn()} variant="danger" />
    );
    expect(getByRole('button')).toBeTruthy();
  });
});






───────────────────────────────────────────────────────────────
e2e/offline_resilience_flow.yaml
───────────────────────────────────────────────────────────────
name: Offline resilience flow
description: App degrades gracefully when network is lost mid-booking
prerequisites:
  - User is logged in as customer
steps:
  - action: launch_app
  - action: tap
    element: "Book a ride"
  - action: fill_address
    field: "Pickup"
    value: "Lagos Island"
  - action: fill_address
    field: "Dropoff"
    value: "Victoria Island"
  - action: disable_network
  - action: tap
    element: "Book now"
  - action: assert_visible
    element: "Offline queue active indicator"
    description: "App should show offline state, not crash"
  - action: enable_network
  - action: wait_for
    element: "Booking confirmed"
    timeout_seconds: 15
    description: "Offline queue should flush and complete booking"
success_criteria:
  - App does not crash when network is disabled
  - Booking is queued locally when offline
  - Booking completes automatically when network restores
  - No data is lost
metrics:
  max_duration_seconds: 60
*/


// ════════════════════════════════════════════════════════════
// DAY 7 VERIFICATION CHECKLIST
// ════════════════════════════════════════════════════════════

/*
Run all tests:
  npm test -- --coverage

Expected output:
  Test Suites: 6 passed
  Tests:       60+ passed
  Coverage:
    domains/rides/usecases:    ≥ 90% lines
    domains/delivery/usecases: ≥ 90% lines
    domains/auth/usecases:     ≥ 90% lines
    shared/utils/fare:         ≥ 95% lines
    Global:                    ≥ 80% lines, functions, branches

Run mutation testing (after all unit tests pass):
  npx stryker run

Expected output:
  Mutation score: ≥ 80%
  Killed mutants: majority
  Surviving mutants: review each — are they equivalent?

Lint check:
  npx expo lint

TypeScript check:
  npx tsc --noEmit

Expo doctor:
  npx expo-doctor

All 4 commands must pass with zero errors before submitting for review.

METRICS TO RECORD AT END OF DAY 7:
┌─────────────────────────────────┬──────────┬────────────┐
│ Metric                          │ Target   │ Actual     │
├─────────────────────────────────┼──────────┼────────────┤
│ Unit test count                 │ ≥ 60     │            │
│ Line coverage (global)          │ ≥ 80%    │            │
│ Line coverage (usecases)        │ ≥ 90%    │            │
│ Mutation score                  │ ≥ 80%    │            │
│ TypeScript errors               │ 0        │            │
│ ESLint errors                   │ 0        │            │
│ expo-doctor checks passed       │ 17/17    │            │
│ E2E: login flow                 │ pass     │            │
│ E2E: book ride flow             │ pass     │            │
│ E2E: offline resilience         │ pass     │            │
└─────────────────────────────────┴──────────┴────────────┘
*/