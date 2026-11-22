/// <reference types="vitest" />
import { describe, expect, it } from "vitest";
import {
  buildQualificationReport,
  inferModule,
  kpisFromCases,
  severityForFailure,
  type QualificationCaseInput,
} from "@qa/shared";

const passing: QualificationCaseInput = {
  id: "navigation_dashboard",
  name: "Navigate dashboard",
  status: "passed",
  durationMs: 2100,
  steps: [{ id: "TP000", name: "Navigate to Dashboard page", status: "passed", durationMs: 2100 }],
};

const matchingFail: QualificationCaseInput = {
  id: "navigation_manual_matching",
  name: "Navigate manual matching",
  status: "failed",
  durationMs: 4000,
  steps: [
    {
      id: "TP-NAVIGATE-MANUAL-MATCHING",
      name: "Navigate to manual matching page",
      status: "failed",
      durationMs: 4000,
      category: "Timeout",
      error: "Timeout 30000ms exceeded",
    },
  ],
};

describe("qualification report", () => {
  it("maps TestCases onto business modules", () => {
    expect(inferModule("Inspect controls on /audit-track/bank", "Inspect_controls__audit_track_bank")).toBe("Audit Track / Filters");
    expect(inferModule("Navigate manual matching")).toBe("Matching & Reconciliation");
    expect(inferModule("Navigate ETL files")).toBe("Data Ingestion");
    expect(inferModule("settlement API fetch")).toBe("Matching & Reconciliation");
  });

  it("classifies timeout failures as blockers", () => {
    expect(severityForFailure("timedOut", "Timeout")).toBe("Blocker");
    expect(severityForFailure("failed", "Assertion Failure")).toBe("Major");
    expect(severityForFailure("failed", "Unknown")).toBe("Medium");
  });

  it("computes TestCase KPIs like the qualification PDF", () => {
    const kpis = kpisFromCases([passing, matchingFail], 82, 6100);
    expect(kpis.totalTestCases).toBe(2);
    expect(kpis.passed).toBe(1);
    expect(kpis.failed).toBe(1);
    expect(kpis.passRate).toBe(0.5);
    expect(kpis.executionRate).toBe(1);
  });

  it("signs off a clean run and withholds sign-off when blockers remain", () => {
    const clean = buildQualificationReport({
      current: { sequentialId: 12, name: "ADAD Release 1.29.1", projectName: "ADAD UI", environment: "AY Staging", durationMs: 1000, qualityScore: 98 },
      cases: [passing],
      editorName: "Takwa Jaouadi",
    });
    expect(clean.signedOff).toBe(true);
    expect(clean.title).toBe("ADAD UI Qualification Report");
    expect(clean.kpis.passRate).toBe(1);
    expect(clean.defects.identified).toBe(0);
    expect(clean.signOff).toMatch(/signs off/i);

    const blocked = buildQualificationReport({
      current: { sequentialId: 13, name: "ADAD nightly", projectName: "ADAD UI", environment: "QA", durationMs: 4000, qualityScore: 40 },
      cases: [matchingFail],
      previous: {
        run: { sequentialId: 12, name: "ADAD Release 1.29.1", projectName: "ADAD UI", environment: "AY Staging", durationMs: 1000, qualityScore: 98 },
        cases: [passing],
      },
      editorName: "QA",
    });
    expect(blocked.signedOff).toBe(false);
    expect(blocked.defects.identified).toBe(1);
    expect(blocked.defects.bySeverity.find((row) => row.severity === "Blocker")?.count).toBe(1);
    expect(blocked.comparison?.rows.some((row) => row.kpi === "Pass Rate")).toBe(true);
    expect(blocked.organization.some((row) => row.module === "Matching & Reconciliation")).toBe(true);
    expect(blocked.analysis.execution.join(" ")).toMatch(/pass rate/i);
    expect(blocked.analysis.defects.join(" ")).toMatch(/blocker/i);
    expect(blocked.defects.items[0]?.analysis).toMatch(/Timeout|environment/i);
    expect(blocked.defects.items[0]?.action.length).toBeGreaterThan(20);
    expect(blocked.defects.items[0]?.testCase).toBe("Navigate manual matching");
  });

  it("records one defect per failed TestCase even when several steps fail", () => {
    const twoFails: QualificationCaseInput = {
      id: "accounting_post_journal",
      name: "Accounting post journal",
      status: "failed",
      durationMs: 8000,
      steps: [
        {
          id: "TP-OPEN-JOURNAL",
          name: "Open journal",
          status: "failed",
          durationMs: 1000,
          category: "Unknown",
          error: "click failed",
        },
        {
          id: "TP-POST-JOURNAL",
          name: "Post journal",
          status: "failed",
          durationMs: 7000,
          category: "Timeout",
          error: "Timeout 30000ms exceeded",
        },
      ],
    };
    const report = buildQualificationReport({
      current: { sequentialId: 14, name: "ADAD nightly", projectName: "ADAD UI", environment: "QA", durationMs: 8000, qualityScore: 40 },
      cases: [passing, twoFails],
      editorName: "QA",
    });
    expect(report.kpis.totalTestCases).toBe(2);
    expect(report.kpis.failed).toBe(1);
    expect(report.defects.identified).toBe(1);
    expect(report.defects.items[0]?.testCaseId).toBe("accounting_post_journal");
    expect(report.defects.items[0]?.testPoint).toBe("TP-POST-JOURNAL");
    expect(report.defects.items[0]?.severity).toBe("Blocker");
    expect(report.defects.items[0]?.message).toMatch(/2 steps failed/i);
    expect(report.analysis.execution.join(" ")).toMatch(/1 TestCase failed/i);
    expect(report.analysis.execution.join(" ")).not.toMatch(/TestPoint/i);
  });
});
