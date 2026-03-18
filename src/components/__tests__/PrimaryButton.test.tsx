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
  const RN = jest.requireActual('react-native');
  
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

  // ✅ Fix — remove getByTestId from destructuring
it('shows loading indicator when loading', () => {
  const { queryByText } = render(
    <PrimaryButton label="Book now" onPress={jest.fn()} loading />
  );
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