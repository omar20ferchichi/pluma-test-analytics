import { describe, expect, it } from "vitest";
import { parseExecutionPackage, parseLogText } from "@qa/shared";

const failingCase = {
  testCase: "DOC-01 Document status filters and search",
  scenarioId: "DOC-01",
  spec: "tests/scenarios/DOC-01.spec.ts",
  project: "chromium",
  retry: 0,
  result: "failed",
  startedAt: "2026-11-21T17:48:25.524Z",
  testpoints: [
    { step: 1, id: "TP-OPEN-DOCUMENTS", description: "Open /app/documents", ticketId: "*****", execution: "passed", durationMs: 900 },
    { step: 2, id: "TP-ACT-DOCUMENTS-01", description: "Search box is visible", ticketId: "*****", execution: "passed", durationMs: 20 },
    { step: 3, id: "TP-ACT-DOCUMENTS-02", description: "Click Status", ticketId: "*****", execution: "failed", durationMs: 49, error: "locator.click: Error: strict mode violation" },
    { step: 4, id: "TP-ACT-DOCUMENTS-03", description: "Select Draft", ticketId: "*****", execution: "not-run" },
  ],
};

const frameworkFixture = {
  testCase: "runTestPoints stops at the first failure",
  spec: "tests/framework/testpoint.spec.ts",
  result: "failed",
  testpoints: [{ id: "TP-FAKE", description: "fails on purpose", execution: "failed", error: "expected failure" }],
};

const file = (relativePath: string, value: unknown) => ({ relativePath, content: typeof value === "string" ? value : JSON.stringify(value) });

describe("test_entretien (Pluma) reports", () => {
  it("parses the [LEVEL] logger format and tracks the TestPoint", () => {
    const lines = parseLogText(
      [
        '2026-11-22T20:22:55.663Z [INFO] Test case "End-to-end › E2E-01 Create a task and delete it" (tests/scenarios/E2E-01.spec.ts)',
        "2026-11-22T20:23:00.493Z [INFO] Running TestPoint TP-ACT-CALENDAR-08: Delete every task",
        "2026-11-22T20:23:03.314Z [ERROR] TestPoint TP-ACT-CALENDAR-08 failed: TimeoutError: locator.click: Timeout 15000ms exceeded.",
      ].join("\n"),
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]?.testCaseId).toBe("E2E-01 Create a task and delete it");
    expect(lines[2]?.level).toBe("ERROR");
    expect(lines[2]?.timestamp).toBe("2026-11-22T20:23:03.314Z");
    expect(lines[2]?.testPointId).toBe("TP-ACT-CALENDAR-08");
  });

  it("maps testcases/*.json: scenarioId, not-run, last successful step; ignores framework fixtures", () => {
    const run = parseExecutionPackage([
      file("testcases/DOC-01.json", failingCase),
      file("testcases/testpoint__fixture.json", frameworkFixture),
      file("logs/DOC-01.log", "2026-11-21T17:48:26.816Z [ERROR] TestPoint TP-ACT-DOCUMENTS-02 failed: Error: strict mode violation"),
    ]);
    expect(run.testCases).toHaveLength(1);
    const tc = run.testCases[0]!;
    expect(tc.id).toBe("DOC-01");
    expect(tc.name).toBe("DOC-01 Document status filters and search");
    expect(tc.file).toBe("tests/scenarios/DOC-01.spec.ts");
    expect(tc.status).toBe("failed");
    expect(tc.testPoints.map((p) => p.status)).toEqual(["passed", "passed", "failed", "skipped"]);
    expect(tc.testPoints[2]?.lastSuccessfulStep).toContain("TP-ACT-DOCUMENTS-01");
    expect(tc.testPoints[2]?.ticketId).toBeUndefined();
    expect(run.logs[0]?.level).toBe("ERROR");
  });
});
