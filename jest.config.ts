import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase|nativewind|tailwindcss)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 70 },
    'src/domains/rides/usecases/': { lines: 90 },
    'src/domains/delivery/usecases/': { lines: 90 },
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};

export default config;