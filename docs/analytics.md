# Analytics

All analytics are deterministic and live in `/shared`. AI is optional and never mutates TestResult rows.

## Execution summary

Counts TestPoints (not Playwright specs): passed / failed / skipped / flaky / blocked, pass rate, duration.

## Failure categories

Derived from error + stack:

Assertion Failure, Timeout, Element Not Found, Network Error, Authentication, API Failure, Database/Data Issue, Environment Issue, Navigation Failure, Unknown.

Manual override: `POST /api/failures/:id/reclassify`.

## Clustering

`fingerprintError()` strips ANSI, UUIDs, ULIDs, ISO timestamps, file paths, and long numbers, then groups failures. The Failure Analysis Center lists clusters first so a shared root cause is visible before opening 50 TestPoints.

## History / regression

Per TestPoint last N statuses:

- **New failure** — previous passed, current failed
- **Regression** — historically stable, recently failing
- **Flaky** — status transition rate ≥ 0.3
- **Slowdown** — duration ≥ 1.5× baseline and +2s

## Comparison

Current vs previous execution: new / fixed / persistent failures, added / removed TestPoints, status changes, duration regressions.

## Quality score

Configurable weights on the project (`QualityConfig`):

`passRate`, `criticalFailures`, `regressions`, `flakiness`, `performance`, `coverage`

Default total 100. Score is `0–100` and shown on the dashboard and executive view.

## Performance

Average, median, P95, slowest TestPoints, duration distribution, pairwise slowdown vs previous execution.
