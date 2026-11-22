/// <reference types="vitest" />
import { describe, expect, it } from "vitest";
import {
  categorizeFailure,
  classifyHistory,
  clusterFailures,
  compareExecutions,
  computeQualityScore,
  fingerprintError,
  parseExecutionPackage,
  parseLogText,
  parsePlaywrightJson,
  parseNativeTestCaseDocuments,
  associateArtifacts,
  summarizeExecution,
  synthesizeTestPointId,
} from "@qa/shared";

const nativeCase = {
  id: "Inspect_controls__audit_track_bank",
  description: "Inspect discovered buttons on /audit-track/bank",
  ticket_id: "TKT-INV",
  status: "ready",
  execution: "failed",
  testpoints: [
    {
      id: "TP-OPEN-AUDIT_TRACK_BANK",
      description: "Open /audit-track/bank",
      ticket_id: "ADAD-0014",
      status: "ready",
      execution: "passed",
    },
    {
      id: "TP",
      description: "Check if bank deposit table is not empty",
      ticket_id: "*****",
      status: "ready",
      execution: "failed",
      error: "Error: Table is empty (No data)",
      stack: "Error: Table is empty (No data)\n    at BasePage.ts:164:13",
    },
  ],
};

const playwrightDoc = {
  config: { version: "1.63.0", workers: 1, projects: [{ name: "chromium" }] },
  suites: [
    {
      title: "filters/auditTrackBankDepositFilters.spec.ts",
      file: "filters/auditTrackBankDepositFilters.spec.ts",
      specs: [
        {
          title: "bank deposit id filter",
          ok: false,
          tests: [
            {
              results: [
                {
                  status: "failed",
                  duration: 1755,
                  retry: 0,
                  startTime: "2026-09-11T16:00:36.698Z",
                  error: {
                    message: "Error: Table is empty (No data)",
                    stack: "Error: Table is empty (No data)\n    at TestPoint.ts:18:7",
                  },
                  stdout: [
                    { text: "2026-09-11T16:00:40.755Z - INFO - Running TestPoint TP-OPEN-AUDIT_TRACK_BANK: Open /audit-track/bank\n" },
                    { text: "2026-09-11T16:00:41.508Z - INFO - Running TestPoint TP: Filter bank deposit id 01M28GDZ8G9ATKR6HDFCZJ1AZ3\n" },
                    { text: "2026-09-11T16:00:41.635Z - INFO - Running TestPoint TP: Check if bank deposit table is not empty\n" },
                    { text: "2026-09-11T16:00:41.932Z - ERROR - TestPoint TP failed: Error: Table is empty (No data)\n" },
                  ],
                  attachments: [{ name: "screenshot", contentType: "image/png", path: "screenshots/fail.png" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("normalize", () => {
  it("synthesizes IDs when TestPoint id is generic TP", () => {
    expect(synthesizeTestPointId("TP", "Check if bank deposit table is not empty")).toBe(
      "TP-CHECK-IF-BANK-DEPOSIT-TABLE-IS-NOT-EMPTY",
    );
    expect(synthesizeTestPointId("TP-OPEN-AUDIT_TRACK_BANK", "Open bank")).toBe("TP-OPEN-AUDIT_TRACK_BANK");
  });

  it("fingerprints volatile error details", () => {
    const a = fingerprintError("Timeout waiting for payment status 01M28GDZ8G9ATKR6HDFCZJ1AZ3");
    const b = fingerprintError("Timeout waiting for payment status 01ZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(a).toBe(b);
  });

  it("categorizes ADAD-style failures", () => {
    expect(categorizeFailure("Error: Table is empty (No data)")).toBe("Database/Data Issue");
    expect(categorizeFailure("Timeout waiting for payment status")).toBe("Timeout");
    expect(categorizeFailure("Expected 200 but received 500")).toBe("API Failure");
    expect(categorizeFailure("Dropdown option 'UNKNOWN_ACQUIRER' not found")).toBe("Element Not Found");
  });
});

describe("log parser", () => {
  it("parses the ultimate_test logger format", () => {
    const lines = parseLogText(`--- Starting test: bank_deposit_id_filter ---
2026-09-11T16:00:37.142Z - INFO - Opening https://qa.staging.adad.io
2026-09-11T16:00:40.755Z - INFO - Running TestPoint TP-OPEN-AUDIT_TRACK_BANK: Open /audit-track/bank
2026-09-11T16:00:41.932Z - ERROR - TestPoint TP-OPEN-AUDIT_TRACK_BANK failed: Error: Table is empty (No data)
    at BankUICheckIfTableNotEmpty.run (src/testpoint/TestPoint.ts:18:7)
`);
    expect(lines[0]?.testCaseId).toBe("bank_deposit_id_filter");
    expect(lines[2]?.testPointId).toBe("TP-OPEN-AUDIT_TRACK_BANK");
    expect(lines[3]?.level).toBe("ERROR");
    expect(lines[3]?.stackTrace).toContain("TestPoint.ts:18:7");
  });
});

describe("native TestCase JSON", () => {
  it("reads testpoints and ticket ids", () => {
    const { testCases } = parseNativeTestCaseDocuments([nativeCase]);
    expect(testCases).toHaveLength(1);
    expect(testCases[0]?.testPoints).toHaveLength(2);
    expect(testCases[0]?.testPoints[1]?.id).toBe("TP-CHECK-IF-BANK-DEPOSIT-TABLE-IS-NOT-EMPTY");
    expect(testCases[0]?.status).toBe("failed");
    expect(testCases[0]?.testPoints[0]?.ticketId).toBe("ADAD-0014");
  });
});

describe("Playwright JSON adapter", () => {
  it("extracts TestPoints from stdout and assigns the failure to the last point", () => {
    const { testCases } = parsePlaywrightJson(playwrightDoc);
    const points = testCases[0]?.testPoints ?? [];
    expect(points.map((p) => p.id)).toContain("TP-OPEN-AUDIT_TRACK_BANK");
    expect(points.at(-1)?.status).toBe("failed");
    expect(points.at(-1)?.error?.category).toBe("Database/Data Issue");
  });
});

describe("package parser", () => {
  it("matches JSON, logs, and videos", () => {
    const parsed = parseExecutionPackage([
      { relativePath: "results.json", content: JSON.stringify(playwrightDoc) },
      { relativePath: "reports/TestCase_bank.json", content: JSON.stringify(nativeCase) },
      {
        relativePath: "execution.log",
        content: "2026-09-11T16:00:40.755Z - INFO - Running TestPoint TP-OPEN-AUDIT_TRACK_BANK: Open /audit-track/bank\n",
      },
      { relativePath: "videos/TP-OPEN-AUDIT_TRACK_BANK.webm", size: 2048 },
      { relativePath: "metadata.json", content: JSON.stringify({ environment: "QA", branch: "main", browser: "chromium" }) },
    ]);
    expect(parsed.validation.ok).toBe(true);
    expect(parsed.metadata.environment).toBe("QA");
    expect(parsed.artifacts.some((a) => a.kind === "video" && a.testPointId === "TP-OPEN-AUDIT_TRACK_BANK")).toBe(true);
    const summary = summarizeExecution(parsed);
    expect(summary.totalTests).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(0);
    expect(clusterFailures(parsed)[0]?.category).toBe("Database/Data Issue");
  });

  it("keeps native TestCases as the tree instead of promoting TestPoints to cases", () => {
    const parsed = parseExecutionPackage([
      { relativePath: "results.json", content: JSON.stringify(playwrightDoc) },
      { relativePath: "reports/TestCase_Inspect_controls__audit_track_bank.json", content: JSON.stringify(nativeCase) },
      { relativePath: "TestCase_Inspect_controls__audit_track_bank.json", content: JSON.stringify(nativeCase) },
    ]);
    expect(parsed.testCases).toHaveLength(1);
    expect(parsed.testCases[0]?.id).toBe("Inspect_controls__audit_track_bank");
    expect(parsed.testCases[0]?.testPoints.map((point) => point.id)).toEqual([
      "TP-OPEN-AUDIT_TRACK_BANK",
      "TP-CHECK-IF-BANK-DEPOSIT-TABLE-IS-NOT-EMPTY",
    ]);
  });

  it("keeps traces for passed TestCases when test-results files are in the package", () => {
    const passedNative = {
      ...nativeCase,
      execution: "passed",
      testpoints: nativeCase.testpoints.map((point) => ({ ...point, execution: "passed", error: undefined, stack: undefined })),
    };
    const passedPlaywright = {
      config: { version: "1.63.0", workers: 1, projects: [{ name: "chromium" }] },
      suites: [
        {
          title: "filters/auditTrackBankDepositFilters.spec.ts",
          file: "filters/auditTrackBankDepositFilters.spec.ts",
          specs: [
            {
              title: "bank deposit id filter",
              ok: true,
              tests: [
                {
                  results: [
                    {
                      status: "passed",
                      duration: 1200,
                      stdout: [
                        { text: "2026-09-11T16:00:40.755Z - INFO - Running TestPoint TP-OPEN-AUDIT_TRACK_BANK: Open /audit-track/bank\n" },
                        { text: "2026-09-11T16:00:41.635Z - INFO - Running TestPoint TP: Check if bank deposit table is not empty\n" },
                      ],
                      attachments: [
                        {
                          name: "trace",
                          contentType: "application/zip",
                          path: "/tmp/test-results/Inspect_controls__audit_track_bank-chromium/trace.zip",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = parseExecutionPackage([
      { relativePath: "results.json", content: JSON.stringify(passedPlaywright) },
      { relativePath: "reports/TestCase_Inspect_controls__audit_track_bank.json", content: JSON.stringify(passedNative) },
      { relativePath: "test-results/Inspect_controls__audit_track_bank-chromium/trace.zip", size: 4096 },
    ]);
    expect(parsed.artifacts.some((item) => item.kind === "trace" && item.testCaseId === "Inspect_controls__audit_track_bank")).toBe(true);
    expect(parsed.testCases[0]?.testPoints.every((point) => point.artifacts.some((item) => item.kind === "trace"))).toBe(true);
    expect(parsed.validation.issues.some((issue) => issue.code === "TRACE_MISSING_ON_DISK")).toBe(false);
  });

  it("binds a recording to the longest matching TestCase, not the first substring", () => {
    const [first] = associateArtifacts(
      [{ kind: "trace", name: "trace.zip", path: "test-results/credit_card_number_filter-chromium/trace.zip" }],
      [],
      ["filter", "payment_id_filter", "credit_card_number_filter"],
    );
    expect(first?.testCaseId).toBe("credit_card_number_filter");
  });

  it("matches generic trace.zip folders to ACC-/DI- TestCase ids", () => {
    const [hit] = associateArtifacts(
      [{
        kind: "trace",
        name: "trace.zip",
        path: "test-results/scenarios-ACC-03-Accounting-ACC-03-Rule-priority-conflict-chromium/trace.zip",
      }],
      [],
      ["ACC-01_Generate_a_journal_entry_from_a_sale_event", "ACC-03_Rule_priority_conflict", "DI-02_Late_file_detection"],
      [
        { id: "ACC-01_Generate_a_journal_entry_from_a_sale_event", name: "Generate a journal entry from a sale event" },
        { id: "ACC-03_Rule_priority_conflict", name: "Rule priority conflict" },
        { id: "DI-02_Late_file_detection", name: "Late file detection" },
      ],
    );
    expect(hit?.testCaseId).toBe("ACC-03_Rule_priority_conflict");
    expect(hit?.name).toContain("ACC-03");
  });

  it("warns when Playwright JSON lists traces that are not in the package", () => {
    const withMissingTrace = structuredClone(playwrightDoc) as typeof playwrightDoc;
    withMissingTrace.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments = [
      { name: "trace", contentType: "application/zip", path: "/tmp/test-results/missing/trace.zip" },
    ];
    const parsed = parseExecutionPackage([{ relativePath: "results.json", content: JSON.stringify(withMissingTrace) }]);
    expect(parsed.validation.issues.some((issue) => issue.code === "TRACE_MISSING_ON_DISK")).toBe(true);
  });

  it("imports one timestamped run folder even if the ZIP contains several iterations", () => {
    const older = {
      config: { version: "1.63.0", workers: 1, projects: [{ name: "chromium" }] },
      suites: [{ specs: [{ title: "old case", ok: true, tests: [{ results: [{ status: "passed", duration: 10, stdout: [] }] }] }] }],
    };
    const newer = {
      config: { version: "1.63.0", workers: 1, projects: [{ name: "chromium" }] },
      suites: [{ specs: [{ title: "new case", ok: true, tests: [{ results: [{ status: "passed", duration: 20, stdout: [{ text: "INFO - Running TestPoint TP-OPEN: Open\n" }] }] }] }] }],
    };
    const parsed = parseExecutionPackage([
      { relativePath: "reports/2026-09-14_10-00-00/results.json", content: JSON.stringify(older) },
      { relativePath: "reports/2026-09-14_10-00-00/logs/old.log", content: "--- Starting test: old ---\n" },
      { relativePath: "reports/2026-09-14_15-10-00/results.json", content: JSON.stringify(newer) },
      { relativePath: "reports/2026-09-14_15-10-00/logs/new.log", content: "--- Starting test: new ---\n2026-09-14T15:10:00.000Z - INFO - Running TestPoint TP-OPEN: Open\n" },
      { relativePath: "reports/2026-09-14_15-10-00/testcases/TestCase_new_case.json", content: JSON.stringify({ id: "new_case", description: "new case", execution: "passed", testpoints: [{ id: "TP-OPEN", description: "Open", execution: "passed" }] }) },
      { relativePath: "reports/2026-09-14_15-10-00/artifacts/spec-chromium/trace.zip", size: 2048 },
      { relativePath: "reports/2026-09-14_15-10-00/html/index.html", content: "<html></html>" },
    ]);
    expect(parsed.validation.issues.some((issue) => issue.code === "MULTI_RUN_PACKAGE")).toBe(true);
    expect(parsed.testCases.some((item) => item.id === "new_case" || item.name === "new case")).toBe(true);
    expect(parsed.testCases.some((item) => item.name === "old case")).toBe(false);
    expect(parsed.logs.some((line) => line.message.includes("Starting test: new"))).toBe(true);
    expect(parsed.logs.some((line) => line.message.includes("Starting test: old"))).toBe(false);
    expect(parsed.artifacts.some((item) => item.kind === "trace" && item.path.includes("15-10-00"))).toBe(true);
  });
});

describe("analytics", () => {
  it("detects new failures, fixes, and slowdowns", () => {
    const delta = compareExecutions(
      "a",
      "b",
      { totalTests: 3, passed: 2, failed: 1, skipped: 0, flaky: 0, blocked: 0, passRate: 2 / 3, failureRate: 1 / 3, totalDurationMs: 1000, averageDurationMs: 333 },
      { totalTests: 3, passed: 1, failed: 2, skipped: 0, flaky: 0, blocked: 0, passRate: 1 / 3, failureRate: 2 / 3, totalDurationMs: 5000, averageDurationMs: 1666 },
      [
        { id: "sale_id_filter", status: "passed", durationMs: 1000 },
        { id: "payment_id_filter", status: "failed", durationMs: 1000 },
        { id: "positive_combinations", status: "passed", durationMs: 1000 },
      ],
      [
        { id: "sale_id_filter", status: "failed", durationMs: 4000 },
        { id: "payment_id_filter", status: "passed", durationMs: 1000 },
        { id: "positive_combinations", status: "failed", durationMs: 1000 },
      ],
    );
    expect(delta.newFailures).toEqual(["sale_id_filter", "positive_combinations"]);
    expect(delta.fixedFailures).toEqual(["payment_id_filter"]);
    expect(delta.performanceRegressions[0]?.testPointId).toBe("sale_id_filter");
  });

  it("scores quality from configurable weights", () => {
    const { score } = computeQualityScore({
      passRate: 0.9,
      failed: 4,
      criticalFailures: 0,
      regressions: 1,
      flakinessScore: 0.1,
      performanceRegressions: 0,
      coverageScore: 1,
    });
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("flags flaky TestPoint history", () => {
    const flags = classifyHistory(
      ["passed", "failed", "passed", "failed", "passed", "failed"],
      [1000, 1100, 1000, 1200, 1000, 1300],
    );
    expect(flags.flaky).toBe(true);
    expect(flags.flakinessScore).toBeGreaterThan(0.3);
  });
});
