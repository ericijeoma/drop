// stryker.config.ts
// File path: stryker.config.ts  (project root — same level as package.json)
//
// Mutation testing configuration.
// Run with: npx stryker run
//
// What mutation testing does:
// Stryker deliberately introduces one bug at a time into your source code
// (flipping > to >=, deleting a return, changing + to -, etc.)
// then runs your test suite against each mutation.
// If tests catch the bug → mutant is KILLED (good).
// If tests still pass despite the bug → mutant SURVIVES (gap in your tests).
// Mutation score = killed / total × 100.
// A 80% mutation score means 80% of real bugs would be caught by your tests.

import type  { PartialStrykerOptions} from '@stryker-mutator/api/core';

const config: PartialStrykerOptions  = {
  packageManager: 'npm',
  reporters:      ['html', 'clear-text', 'progress'],
  testRunner:     'jest',
  jest: {
    projectType:           'custom',
    configFile:            'jest.config.ts',
    enableFindRelatedTests: true,
  },
  checkers:    ['typescript'],
  tsconfigFile: 'tsconfig.json',

  // Only mutate the highest-value code:
  // domain use cases + shared utils + domain entities
  mutate: [
    'src/domains/**/usecases/*.ts',
    'src/domains/**/entities/*.ts',
    'src/shared/utils/fare.ts',
    'src/shared/utils/directions.ts',
    'src/shared/utils/format.ts',
    // Exclude test files, type declarations, and index files
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],

  // Run only the relevant tests for each mutant
  coverageAnalysis: 'perTest',

  // Longer timeout because React Native test environment is slower
  timeoutMS:       60_000,
  timeoutFactor:   2.5,

  // Run 4 mutations in parallel — adjust based on your CPU count
  concurrency: 4,

  // Minimum thresholds — CI pipeline will FAIL if mutation score drops below these
  thresholds: {
    high:  80,   // green — aim for this
    low:   65,   // amber — warning, investigate surviving mutants
    break: 50,   // red — CI fails, do not merge
  },

  // Save HTML report for reviewing surviving mutants
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // Ignore these mutant types — they are not worth testing
  // (e.g. string literal changes in log messages don't affect business logic)
  ignorers: [
    // Ignore string mutations in logger calls
    'StringLiteralMutator',
  ],

  // Plugins included automatically by @stryker-mutator/jest-runner
  // and @stryker-mutator/typescript-checker
};

export default config;