// ════════════════════════════════════════════════════════════
// DAY 7 VERIFICATION CHECKLIST
// ════════════════════════════════════════════════════════════
 

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


Reminder: Just before production we need to install Sentry for proper logging