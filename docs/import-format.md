# Import format (test_entretien)

The importer detects files and runs adapters; it does not hard-code one schema. The ADAD
(`ultimate_test`) format is still accepted.

## One execution = one Playwright run

test_entretien's reporter (`src/configuration/plumaReporter.ts`) writes each `npx playwright test` to:

```
reports/2026-11-22_20-22-55/
├── results.json              # Playwright JSON reporter
├── summary.json              # status, updatedAt, totals
├── logs/*.log                # one log per test case
├── testcases/*.json          # one TestCase report with its TestPoints
├── artifacts/**/             # trace.zip, screenshots, error-context.md
└── html/                     # Playwright HTML report (not imported)
```

Import the whole `reports/` folder with `npm run import:reports` (each new timestamped run becomes
one execution), or upload a ZIP of a single run folder from **Import**.

Execution metadata: name = `<timestamp> · <spec filter>` (from `results.json → config.argv`),
startedAt = `stats.startTime`, finishedAt = `summary.json → updatedAt`, environment = `app.pluma.ai`
(override with `PLUMA_ENVIRONMENT`).

## Adapter 1 — TestCase report (`testcases/*.json`)

```json
{
  "testCase": "DOC-01 Document status filters and search",
  "scenarioId": "DOC-01",
  "spec": "tests/scenarios/DOC-01.spec.ts",
  "project": "chromium",
  "retry": 0,
  "result": "failed",
  "testpoints": [
    { "step": 3, "id": "TP-ACT-DOCUMENTS-02", "description": "Click Status …", "ticketId": "*****",
      "execution": "failed", "durationMs": 49, "error": "locator.click: Error: strict mode violation …" },
    { "step": 4, "id": "TP-ACT-DOCUMENTS-03", "description": "Select the \"Draft\" status filter", "execution": "not-run" }
  ]
}
```

- `scenarioId` → TestCase id; `testCase` → name; `spec` → file.
- `execution`: `passed` / `failed` / `not-run` (→ skipped). `ticketId: "*****"` is treated as empty.
- Every TestPoint occurrence is stored (TestPoints are shared and repeated).
- Documents whose `spec` is under `tests/framework/` are runner fixtures and are skipped.

## Adapter 2 — Playwright JSON reporter (`results.json`)

Enriches TestCases (file, retries, attachments) and adds tests that have no TestCase report.

## Logs

```
2026-11-22T20:22:55.663Z [INFO] Test case "End-to-end › E2E-01 Create a task and delete it" (tests/scenarios/E2E-01.spec.ts)
2026-11-22T20:23:00.493Z [INFO] Running TestPoint TP-ACT-CALENDAR-08: Delete every "QA-E2E" task …
2026-11-22T20:23:03.314Z [ERROR] TestPoint TP-ACT-CALENDAR-08 failed: TimeoutError: locator.click: Timeout 15000ms exceeded.
```

Pattern: `{ISO8601} [LEVEL] {message}` (the ADAD `{ISO8601} - LEVEL - {message}` form also parses).
Lines are linked to the current TestCase and TestPoint.

## Traces and screenshots

`artifacts/<spec-folder>/trace.zip` is unpacked and opens in the built-in Playwright Trace Viewer;
the recording is shared by every TestPoint in that TestCase.
