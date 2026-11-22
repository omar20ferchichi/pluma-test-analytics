export type DefectSeverity = "Blocker" | "Major" | "Medium" | "Minor";

export interface QualificationCaseInput {
  id: string;
  name: string;
  status: string;
  durationMs: number;
  steps: Array<{
    id: string;
    name: string;
    status: string;
    durationMs: number;
    category?: string | null;
    error?: string | null;
  }>;
}

export interface QualificationRunInput {
  sequentialId: number;
  name?: string | null;
  projectName: string;
  environment?: string | null;
  browser?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  pipeline?: string | null;
  ciProvider?: string | null;
  sourceFormat?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  durationMs: number;
  qualityScore: number;
  playwrightVersion?: string | null;
  baseUrl?: string | null;
  workers?: number | null;
}

export interface QualificationKpis {
  totalTestCases: number;
  totalTestPoints: number;
  executed: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  toDo: number;
  passRate: number;
  executionRate: number;
  durationMs: number;
  qualityScore: number;
}

export interface QualificationDefect {
  testCaseId: string;
  testCase: string;
  testPoint: string;
  description: string;
  module: string;
  severity: DefectSeverity;
  category: string;
  message: string;
  vsPrevious?: "new" | "remaining" | "unknown";
  impact: string;
  analysis: string;
  action: string;
}

export interface QualificationReport {
  kind: "qualification";
  generatedAt: string;
  title: string;
  subtitle: string;
  editor: { role: string; name: string; date: string };
  project: string;
  executionLabel: string;
  previousLabel?: string;
  objective: string[];
  scope: {
    inScope: string[];
    outOfScope: string[];
    modules: string[];
    previous?: { label: string; testCases: number; passRate: number };
  };
  strategy: Array<{ title: string; body: string }>;
  environment: Array<{ item: string; details: string }>;
  kpis: QualificationKpis;
  previousKpis?: QualificationKpis;
  organization: Array<{
    module: string;
    testCases: number;
    testPoints: number;
    passed: number;
    failed: number;
    skipped: number;
  }>;
  defects: {
    identified: number;
    open: number;
    fixedVsPrevious: number;
    fixRate: number | null;
    bySeverity: Array<{ severity: DefectSeverity; count: number }>;
    byModule: Array<{ module: string; Blocker: number; Major: number; Medium: number; Minor: number; total: number }>;
    items: QualificationDefect[];
    qualityKpis: Array<{ kpi: string; value: string }>;
  };
  highlights: string[];
  analysis: {
    execution: string[];
    organization: string[];
    defects: string[];
    comparison: string[];
  };
  comparison?: {
    previousLabel: string;
    currentLabel: string;
    rows: Array<{ kpi: string; previous: string; current: string; improvement: string }>;
  };
  risks: Array<{ risk: string; mitigation: string }>;
  conclusion: string[];
  signOff: string;
  signedOff: boolean;
  cases: Array<{
    id: string;
    name: string;
    module: string;
    status: string;
    testPoints: number;
    durationMs: number;
  }>;
}

const MODULE_RULES: Array<[RegExp, string]> = [
  [/\b(audit[-\s]?track|filter|bank deposit|sale id)/i, "Audit Track / Filters"],
  [/\b(match|reconcil|refund debit)/i, "Matching & Reconciliation"],
  [/\b(account|ledger|journal)/i, "Accounting"],
  [/\b(ingest|etl|upload|file dashboard|\bimport\b)/i, "Data Ingestion"],
  [/\b(e2e|end[-\s]?to[-\s]?end|smoke|workflow)/i, "End-to-End"],
  [/\b(settlement|payment status)/i, "Matching & Reconciliation"],
  [/\b(navigat|dashboard|cash forecast|alert)/i, "Navigation"],
  [/\b(auth|login|sso)/i, "Authentication"],
  [/\bapi\b/i, "API"],
];

export function inferModule(...parts: Array<string | null | undefined>): string {
  const text = parts.filter(Boolean).join(" ");
  for (const [pattern, label] of MODULE_RULES) {
    if (pattern.test(text)) return label;
  }
  return "Functional";
}

export function isFailedStatus(status: string): boolean {
  return status === "failed" || status === "timedOut" || status === "interrupted";
}

export function isPassedStatus(status: string): boolean {
  return status === "passed" || status === "flaky";
}

export function severityForFailure(status: string, category?: string | null): DefectSeverity {
  if (status === "timedOut" || category === "Timeout" || category === "Environment Issue") return "Blocker";
  if (
    category === "Network Error" ||
    category === "Authentication" ||
    category === "API Failure" ||
    category === "Navigation Failure"
  ) {
    return "Major";
  }
  if (category === "Assertion Failure" || category === "Database/Data Issue" || category === "Element Not Found") {
    return "Major";
  }
  return "Medium";
}

export function kpisFromCases(cases: QualificationCaseInput[], qualityScore = 0, durationMs = 0): QualificationKpis {
  const totalTestCases = cases.length;
  const totalTestPoints = cases.reduce((sum, item) => sum + item.steps.length, 0);
  const passed = cases.filter((item) => isPassedStatus(item.status)).length;
  const failed = cases.filter((item) => isFailedStatus(item.status)).length;
  const skipped = cases.filter((item) => item.status === "skipped" || item.status === "blocked").length;
  const flaky = cases.filter((item) => item.status === "flaky" || item.steps.some((step) => step.status === "flaky")).length;
  const executed = totalTestCases - skipped;
  return {
    totalTestCases,
    totalTestPoints,
    executed,
    passed,
    failed,
    skipped,
    flaky,
    toDo: 0,
    passRate: totalTestCases ? passed / totalTestCases : 0,
    executionRate: totalTestCases ? executed / totalTestCases : 0,
    durationMs: durationMs || cases.reduce((sum, item) => sum + item.durationMs, 0),
    qualityScore,
  };
}

export function formatPctPoints(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatFrDate(value?: Date | string | null, fallback = new Date()): string {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return formatFrDate(fallback);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function relativeChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "Stable" : "n/a";
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(delta) < 0.05) return "Stable";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function pointChange(current: number, previous: number): string {
  const delta = (current - previous) * 100;
  if (Math.abs(delta) < 0.05) return `Stable (${delta >= 0 ? "+" : ""}${delta.toFixed(2)}pp)`;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}pp`;
}

function runTitle(run: QualificationRunInput): string {
  const name = run.name?.trim();
  if (!name || /^execution\s*#?\s*\d+$/i.test(name)) return `Execution #${run.sequentialId}`;
  return name;
}

function runLabel(run: QualificationRunInput): string {
  const title = runTitle(run);
  if (title === `Execution #${run.sequentialId}`) return title;
  return `${title} (Execution #${run.sequentialId})`;
}

function listModules(cases: QualificationCaseInput[]): string[] {
  const counts = new Map<string, number>();
  for (const item of cases) {
    const module = inferModule(item.name, item.id);
    counts.set(module, (counts.get(module) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

function organization(cases: QualificationCaseInput[]) {
  const groups = new Map<string, QualificationCaseInput[]>();
  for (const item of cases) {
    const module = inferModule(item.name, item.id);
    const rows = groups.get(module) ?? [];
    rows.push(item);
    groups.set(module, rows);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([module, rows]) => ({
      module,
      testCases: rows.length,
      testPoints: rows.reduce((sum, item) => sum + item.steps.length, 0),
      passed: rows.filter((item) => isPassedStatus(item.status)).length,
      failed: rows.filter((item) => isFailedStatus(item.status)).length,
      skipped: rows.filter((item) => item.status === "skipped" || item.status === "blocked").length,
    }));
}

function collectDefects(cases: QualificationCaseInput[]): QualificationDefect[] {
  const defects: QualificationDefect[] = [];
  for (const item of cases) {
    const failedSteps = item.steps.filter((step) => isFailedStatus(step.status));
    if (!isFailedStatus(item.status) && !failedSteps.length) continue;
    const step = [...failedSteps].sort(
      (a, b) =>
        severityRank(severityForFailure(a.status, a.category)) - severityRank(severityForFailure(b.status, b.category)),
    )[0];
    const extra =
      failedSteps.length > 1 ? ` ${failedSteps.length} steps failed; the most severe is reported as the finding.` : "";
    const base = {
      testCaseId: item.id,
      testCase: item.name,
      testPoint: step?.id ?? item.id,
      description: step?.name ?? item.name,
      module: inferModule(item.name, item.id),
      severity: severityForFailure(step?.status ?? item.status, step?.category),
      category: step?.category ?? "Unknown",
      message: `${(step?.error ?? "").trim()}${extra}`.trim(),
    };
    defects.push({ ...base, ...defectNarrative(base) });
  }
  return defects;
}

function severityRank(severity: DefectSeverity): number {
  if (severity === "Blocker") return 0;
  if (severity === "Major") return 1;
  if (severity === "Medium") return 2;
  return 3;
}

function clip(value: string, max = 180): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function durationPhrase(ms: number): string {
  if (!ms) return "an unspecified duration";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} seconds`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
}

function defectNarrative(defect: {
  testCase: string;
  testPoint: string;
  description: string;
  module: string;
  severity: DefectSeverity;
  category: string;
  message: string;
}): Pick<QualificationDefect, "impact" | "analysis" | "action"> {
  const where = defect.testCase;
  const stepHint = defect.testPoint && defect.testPoint !== defect.testCase
    ? ` Failed step ${defect.testPoint}${defect.description ? ` (${defect.description})` : ""}.`
    : "";
  const evidence = defect.message ? ` Observed error: ${clip(defect.message)}` : "";
  if (defect.category === "Timeout" || defect.category === "Environment Issue") {
    return {
      impact:
        defect.severity === "Blocker"
          ? "Blocking — the TestCase did not complete, so this execution cannot be signed off until it is retested on a stable environment."
          : "High — the TestCase did not finish, so the functional result is unknown.",
      analysis: `${where} failed as ${defect.category}.${stepHint}${evidence} This pattern usually indicates environment instability, a missing wait, or slow downstream data rather than a confirmed business-rule defect in ${defect.module}.`,
      action: "Inspect the TestCase video/trace, confirm environment health, then re-run the TestCase. Treat it as a product defect only if it reproduces on a stable run.",
    };
  }
  if (defect.category === "Assertion Failure" || defect.category === "Database/Data Issue") {
    return {
      impact: "Functional — expected business data or state did not match, so the TestCase is failed.",
      analysis: `${where} failed a ${defect.category.toLowerCase()} in ${defect.module}.${stepHint}${evidence} This is a qualification-relevant finding: either the application did not produce the expected result, or the campaign dataset/precondition is wrong.`,
      action: "Compare expected vs actual for this TestCase, confirm the input file/dataset, then fix the product or the fixture and retest the full TestCase.",
    };
  }
  if (defect.category === "Element Not Found" || defect.category === "Navigation Failure") {
    return {
      impact: "UI / flow — the TestCase could not reach or locate the expected screen control, so the scenario was not validated.",
      analysis: `${where} failed with ${defect.category}.${stepHint}${evidence} This often follows a UI change, a delayed page, or a broken navigation path in ${defect.module}.`,
      action: "Watch the TestCase recording, confirm whether the UI changed, update the locator or product flow, and retest the TestCase.",
    };
  }
  if (defect.category === "Network Error" || defect.category === "API Failure" || defect.category === "Authentication") {
    return {
      impact: "Integration — a dependent service or session failed, which can cascade into false functional failures.",
      analysis: `${where} failed with ${defect.category}.${stepHint}${evidence} Check whether this is a real regression in ${defect.module} or an expired session / unavailable API.`,
      action: "Verify auth and API availability, retry the TestCase, and raise a defect only if the same contract still fails.",
    };
  }
  return {
    impact: `${defect.severity} — the TestCase failed and cannot be considered passed.`,
    analysis: `${where} failed (${defect.category}).${stepHint}${evidence} Further triage with logs and recordings is required to classify this as product, data, or environment.`,
    action: "Open the TestCase recording and logs, classify the root cause, then retest after the fix.",
  };
}

function buildSectionAnalysis(input: {
  kpis: QualificationKpis;
  previousKpis?: QualificationKpis;
  modules: string[];
  organization: ReturnType<typeof organization>;
  defects: QualificationDefect[];
  previousDefects: QualificationDefect[];
  blockers: number;
  signedOff: boolean;
  conditional: boolean;
  e2e?: ReturnType<typeof organization>[number];
  previousLabel?: string;
  label: string;
  env: string;
}): QualificationReport["analysis"] {
  const { kpis, previousKpis, modules, organization: org, defects, previousDefects, blockers, signedOff, conditional, e2e, previousLabel, label, env } = input;
  const failedModules = org.filter((row) => row.failed > 0).map((row) => row.module);
  const concentrated = org.filter((row) => row.failed > 0);
  const newCount = defects.filter((item) => item.vsPrevious === "new").length;
  const remainingCount = defects.filter((item) => item.vsPrevious === "remaining").length;

  const execution = [
    `${label} ran on ${env} for ${durationPhrase(kpis.durationMs)}. ${kpis.executed} of ${kpis.totalTestCases} TestCases were executed (${formatPctPoints(kpis.executionRate)} execution rate).`,
    kpis.failed === 0
      ? `All executed TestCases passed (${formatPctPoints(kpis.passRate)} pass rate). No residual failed TestCase remains open in this iteration.`
      : `${kpis.failed} TestCase${kpis.failed === 1 ? "" : "s"} failed, so the TestCase pass rate is ${formatPctPoints(kpis.passRate)}. Failed coverage is concentrated in ${joinAnd(failedModules.length ? failedModules : ["unclassified modules"])}.`,
    kpis.skipped
      ? `${kpis.skipped} TestCase${kpis.skipped === 1 ? " was" : "s were"} skipped or blocked and therefore do not contribute to the pass-rate numerator.`
      : `No TestCases were left in To Do / skipped, so the KPI table reflects a complete execution of the imported package.`,
    signedOff
      ? "From a QA gate perspective, the numeric result supports sign-off: full execution, no failed TestCase, no blocker."
      : conditional
        ? "From a QA gate perspective, the campaign is not a full sign-off. Residual non-blocking failed TestCases remain and must be tracked."
        : "From a QA gate perspective, blocker or failed TestCases prevent sign-off until they are resolved and retested.",
  ];

  const organization = [
    org.length <= 1
      ? `This iteration is a targeted run: ${kpis.totalTestCases} TestCase${kpis.totalTestCases === 1 ? "" : "s"} sit in ${joinAnd(modules)}. It should not be read as a full-release regression across all Pluma modules.`
      : `Coverage is spread across ${org.length} modules (${joinAnd(modules)}). Module totals below are TestCases.`,
    concentrated.length
      ? `Failures are not uniform: ${concentrated.map((row) => `${row.module} (${row.failed} failed / ${row.testCases} TestCases)`).join("; ")}.`
      : "Every listed module completed without a failed TestCase in this execution.",
    e2e
      ? `End-to-End is ${e2e.failed === 0 ? "clean" : "not clean"} (${e2e.passed} passed, ${e2e.failed} failed of ${e2e.testCases}).`
      : "No dedicated End-to-End TestCases were present, so cross-module business continuity was not re-proven in this package.",
  ];

  const topModule = [...input.defects.reduce((map, item) => {
    map.set(item.module, (map.get(item.module) ?? 0) + 1);
    return map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
  const defectAnalysis = [
    defects.length === 0
      ? "No failed TestCases were recorded. Defect KPIs are therefore zero: nothing to distribute by severity or module, and no open qualification findings from this run."
      : `${defects.length} failed TestCase${defects.length === 1 ? "" : "s"} ${defects.length === 1 ? "is" : "are"} treated as defects. Severity mix: ${input.defects.filter((d) => d.severity === "Blocker").length} blocker, ${input.defects.filter((d) => d.severity === "Major").length} major, ${input.defects.filter((d) => d.severity === "Medium").length} medium, ${input.defects.filter((d) => d.severity === "Minor").length} minor.`,
    defects.length && topModule
      ? `Defects concentrate in ${topModule[0]} (${topModule[1]} of ${defects.length}). That module should be the first triage target before any deployment discussion.`
      : "",
    previousLabel
      ? `${remainingCount} TestCase${remainingCount === 1 ? "" : "s"} remain failed from ${previousLabel}, ${newCount} ${newCount === 1 ? "is" : "are"} new, and ${Math.max(0, previousDefects.length - remainingCount)} ${previousDefects.length - remainingCount === 1 ? "was" : "were"} fixed versus that baseline.`
      : "No previous execution was available, so these defects are reported as identified in this campaign only.",
    blockers
      ? `${blockers} blocker${blockers === 1 ? "" : "s"} remain. QA cannot sign off while they are open.`
      : defects.length
        ? "No blockers were raised. Remaining findings are functional or data issues that still fail their TestCase and should be scheduled to closure."
        : "",
  ].filter(Boolean);

  const comparison = previousKpis && previousLabel
    ? [
        `Compared with ${previousLabel}, TestCase volume is ${relativeChange(kpis.totalTestCases, previousKpis.totalTestCases)} (${previousKpis.totalTestCases} → ${kpis.totalTestCases}) and pass rate moved ${pointChange(kpis.passRate, previousKpis.passRate)} (${formatPctPoints(previousKpis.passRate)} → ${formatPctPoints(kpis.passRate)}).`,
        `Failed TestCase count moved ${relativeChange(defects.length, previousDefects.length)} (${previousDefects.length} → ${defects.length}). A stable defect count is not automatically good if the same TestCases are still failing — see remaining vs new in section 7.`,
        kpis.passRate >= previousKpis.passRate && defects.length <= previousDefects.length
          ? "The trend does not show a new quality collapse versus the previous iteration."
          : "The trend is not an improvement versus the previous iteration; triage new or remaining failed TestCases before treating this run as a release baseline.",
      ]
    : ["No previous execution exists in this project, so release-over-release KPI comparison is not available."];

  return { execution, organization, defects: defectAnalysis, comparison };
}

function confidence(kpis: QualificationKpis, blockers: number): string {
  if (blockers === 0 && kpis.failed === 0 && kpis.executionRate >= 1) return "High";
  if (blockers === 0 && kpis.passRate >= 0.95) return "Medium";
  return "Low";
}

function joinAnd(items: string[]): string {
  if (!items.length) return "the in-scope modules";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildQualificationReport(input: {
  current: QualificationRunInput;
  cases: QualificationCaseInput[];
  previous?: { run: QualificationRunInput; cases: QualificationCaseInput[] };
  editorName: string;
  editorRole?: string;
  generatedAt?: Date;
}): QualificationReport {
  const generatedAt = input.generatedAt ?? new Date();
  const kpis = kpisFromCases(input.cases, input.current.qualityScore, input.current.durationMs);
  const previousKpis = input.previous
    ? kpisFromCases(input.previous.cases, input.previous.run.qualityScore, input.previous.run.durationMs)
    : undefined;
  const modules = listModules(input.cases);
  const orgRows = organization(input.cases);
  const defects = collectDefects(input.cases);
  const previousDefects = input.previous ? collectDefects(input.previous.cases) : [];
  const prevFailedIds = new Set(previousDefects.map((item) => item.testCaseId));
  const currFailedIds = new Set(defects.map((item) => item.testCaseId));
  for (const defect of defects) {
    defect.vsPrevious = input.previous ? (prevFailedIds.has(defect.testCaseId) ? "remaining" : "new") : "unknown";
  }
  const fixedVsPrevious = [...prevFailedIds].filter((id) => !currFailedIds.has(id)).length;
  const blockers = defects.filter((item) => item.severity === "Blocker").length;
  const env = input.current.environment || "the target environment";
  const label = runTitle(input.current);
  const project = input.current.projectName;
  const previousLabel = input.previous ? runTitle(input.previous.run) : undefined;
  const e2e = orgRows.find((row) => row.module === "End-to-End");
  const e2eCoverage =
    !e2e ? "Not in this execution" : e2e.failed === 0 && e2e.testCases > 0 ? "Completed" : "Partial";
  const prodLike = /stag|prod|preprod|uat/i.test(env) ? "Enabled" : "Campaign environment";
  const qaConfidence = confidence(kpis, blockers);
  const signedOff = blockers === 0 && kpis.failed === 0;
  const conditional = blockers === 0 && kpis.failed > 0;

  const severityOrder: DefectSeverity[] = ["Blocker", "Major", "Medium", "Minor"];
  const bySeverity = severityOrder.map((severity) => ({
    severity,
    count: defects.filter((item) => item.severity === severity).length,
  }));

  const moduleNames = [...new Set([...modules, ...defects.map((item) => item.module)])];
  const byModule = moduleNames
    .map((module) => {
      const rows = defects.filter((item) => item.module === module);
      const bucket = { module, Blocker: 0, Major: 0, Medium: 0, Minor: 0, total: rows.length };
      for (const row of rows) bucket[row.severity] += 1;
      return bucket;
    })
    .filter((row) => row.total > 0);

  const fixRate = previousDefects.length ? fixedVsPrevious / previousDefects.length : null;

  let signOff: string;
  if (signedOff) {
    signOff = `QA officially signs off ${label} for the next deployment gate.`;
  } else if (conditional) {
    signOff = `QA does not give an unconditional sign-off. Residual non-blocking defects remain open and should be scheduled before client deployment.`;
  } else {
    signOff = `QA does not sign off ${label}. Blocking defects remain open and must be resolved and retested.`;
  }

  const objective = [
    `The objective of this qualification phase was to provide QA validation of ${project} based on automated Playwright TestCase execution ${label}, executed on the ${env} environment.`,
    `The campaign covered ${kpis.totalTestCases} TestCases across ${joinAnd(modules)}.`,
    input.previous
      ? `Where available, results are compared with the previous execution ${previousLabel} to confirm non-regression of critical workflows.`
      : `This report is the qualification record for a single execution iteration, including TestCase outcomes, failed TestCases treated as defects, and the QA conclusion.`,
    `The objective was to ensure that the complete ${label} deliverable is stable and ready for the next deployment gate.`,
  ];

  const highlights = [
    `${label} was executed on ${env}${input.current.browser ? ` using ${input.current.browser}` : ""}.`,
    `The suite contained ${kpis.totalTestCases} TestCases, with ${formatPctPoints(kpis.executionRate)} execution rate and ${formatPctPoints(kpis.passRate)} TestCase pass rate.`,
    defects.length === 0
      ? `No failed TestCases were identified during this execution, and no blocking, major, medium, or minor defects were raised from the run.`
      : `${defects.length} failed TestCase${defects.length === 1 ? " was" : "s were"} identified (${blockers} blocker, ${bySeverity.find((row) => row.severity === "Major")?.count ?? 0} major). These are recorded as defects for this campaign.`,
    input.previous
      ? `Compared with ${previousLabel}, TestCase volume moved from ${previousKpis!.totalTestCases} to ${kpis.totalTestCases} (${relativeChange(kpis.totalTestCases, previousKpis!.totalTestCases)}) and defects from ${previousDefects.length} to ${defects.length} (${relativeChange(defects.length, previousDefects.length)}).`
      : `No previous execution was available in this project for a release-over-release comparison.`,
  ];

  const conclusion = [
    `The qualification of ${project} ${label} was completed on the ${env} environment.`,
    `The campaign executed ${kpis.executed} of ${kpis.totalTestCases} TestCases (${kpis.passed} passed, ${kpis.failed} failed, ${kpis.skipped} skipped) with quality score ${Math.round(kpis.qualityScore)}.`,
    e2e
      ? `End-to-End coverage: ${e2e.testCases} TestCases (${e2e.passed} passed, ${e2e.failed} failed).`
      : `No dedicated End-to-End module was present in this execution; coverage is described by the modules listed in section 6.`,
    signedOff
      ? `Based on these results, QA considers ${label} stable, qualified, and ready for the next deployment gate.`
      : conditional
        ? `Based on these results, QA considers the campaign largely complete, with residual non-blocking defects that should be tracked to closure.`
        : `Based on these results, QA does not consider ${label} ready for client deployment until blocking defects are resolved.`,
  ];

  const risks: Array<{ risk: string; mitigation: string }> = [
    { risk: "Environment instability", mitigation: "Coordinate with DevOps and re-run blocked TestCases after recovery." },
    { risk: "Complex business scenarios", mitigation: "Prioritize critical flows and inspect videos/traces for failed TestCases." },
    { risk: "Production-like data complexity", mitigation: "Use dedicated datasets and record data preconditions in TestCase logs." },
    { risk: "Cross-module dependencies", mitigation: "Keep End-to-End and navigation cases in the same execution iteration." },
  ];
  if (defects.some((item) => item.category === "Environment Issue" || item.category === "Timeout")) {
    risks.unshift({
      risk: "Timeouts or environment errors in this run",
      mitigation: "Treat blocker failures as environment first; retest after the platform is stable.",
    });
  }
  if (input.previous && defects.some((item) => !prevFailedIds.has(item.testCaseId))) {
    risks.push({
      risk: "New regressions versus the previous execution",
      mitigation: "Triage new failed TestCases before sign-off; compare videos with the previous run.",
    });
  }

  const comparison = previousKpis && previousLabel
    ? {
        previousLabel: runLabel(input.previous!.run),
        currentLabel: runLabel(input.current),
        rows: [
          {
            kpi: "Regression Test Cases",
            previous: String(previousKpis.totalTestCases),
            current: String(kpis.totalTestCases),
            improvement: relativeChange(kpis.totalTestCases, previousKpis.totalTestCases),
          },
          {
            kpi: "Defects Identified",
            previous: String(previousDefects.length),
            current: String(defects.length),
            improvement: relativeChange(defects.length, previousDefects.length),
          },
          {
            kpi: "Defects per 100 Test Cases",
            previous: previousKpis.totalTestCases
              ? ((previousDefects.length / previousKpis.totalTestCases) * 100).toFixed(2)
              : "0.00",
            current: kpis.totalTestCases ? ((defects.length / kpis.totalTestCases) * 100).toFixed(2) : "0.00",
            improvement: relativeChange(
              kpis.totalTestCases ? (defects.length / kpis.totalTestCases) * 100 : 0,
              previousKpis.totalTestCases ? (previousDefects.length / previousKpis.totalTestCases) * 100 : 0,
            ),
          },
          {
            kpi: "Pass Rate",
            previous: formatPctPoints(previousKpis.passRate),
            current: formatPctPoints(kpis.passRate),
            improvement: pointChange(kpis.passRate, previousKpis.passRate),
          },
        ],
      }
      : undefined;

  const analysis = buildSectionAnalysis({
    kpis,
    previousKpis,
    modules,
    organization: orgRows,
    defects,
    previousDefects,
    blockers,
    signedOff,
    conditional,
    e2e,
    previousLabel,
    label,
    env,
  });

  return {
    kind: "qualification",
    generatedAt: generatedAt.toISOString(),
    title: `${project} Qualification Report`,
    subtitle: label,
    editor: {
      role: input.editorRole?.trim() || "Qualification Manager",
      name: input.editorName.trim() || "QA",
      date: formatFrDate(input.current.finishedAt ?? input.current.startedAt ?? generatedAt, generatedAt),
    },
    project,
    executionLabel: label,
    previousLabel,
    objective,
    scope: {
      modules,
      inScope: [
        `Automated qualification of ${label} on ${env}.`,
        `Functional validation of ${joinAnd(modules)}.`,
        `Failed TestCase analysis (defects, videos, and traces).`,
        input.previous
          ? `Non-regression comparison against ${previousLabel}.`
          : `Full TestCase results for this execution iteration.`,
      ],
      outOfScope: [
        "Performance and load testing.",
        "UI cosmetic validation.",
        "Manual exploratory testing outside the imported Playwright package.",
      ],
      previous: input.previous
        ? { label: previousLabel!, testCases: previousKpis!.totalTestCases, passRate: previousKpis!.passRate }
        : undefined,
    },
    strategy: [
      {
        title: "a. Automated Playwright execution",
        body: `The campaign used automated Playwright TestCases. One execution iteration contains the JSON report, native TestCase files, logs, and recordings for ${label}.`,
      },
      {
        title: "b. TestCase coverage",
        body: `${kpis.totalTestCases} TestCases were imported and evaluated as the qualification unit. A TestCase fails if any of its steps fail.`,
      },
      {
        title: "c. Defect analysis",
        body:
          defects.length === 0
            ? "No failed TestCases were recorded. Defect KPIs are therefore zero for this execution."
            : "Failed TestCases are treated as defects, classified by failure category into Blocker / Major / Medium, and grouped by functional module.",
      },
      {
        title: "d. Targeted non-regression",
        body: input.previous
          ? `Results are compared with ${previousLabel} to highlight new failed TestCases, fixed TestCases, and pass-rate movement without duplicating a separate campaign.`
          : "This is the first stored execution for the project, so non-regression is limited to the tests contained in this package.",
      },
      ...(e2e
        ? [
            {
              title: "e. End-to-End testing",
              body: `End-to-End coverage included ${e2e.testCases} TestCases (${e2e.passed} passed, ${e2e.failed} failed) to verify that critical business workflows remain intact.`,
            },
          ]
        : []),
    ],
    environment: [
      { item: "Environment", details: env },
      { item: "Build / Execution", details: runLabel(input.current) },
      { item: "Browser", details: input.current.browser || "—" },
      { item: "Branch", details: input.current.branch || "—" },
      { item: "Commit", details: input.current.commitSha || "—" },
      { item: "Base URL", details: input.current.baseUrl || "—" },
      { item: "Playwright", details: input.current.playwrightVersion || input.current.sourceFormat || "Playwright" },
      { item: "CI / Pipeline", details: [input.current.ciProvider, input.current.pipeline].filter(Boolean).join(" · ") || "Local / imported package" },
      { item: "Workers", details: input.current.workers != null ? String(input.current.workers) : "—" },
      { item: "Execution Type", details: "Automated Playwright TestCase campaign" },
      { item: "Test Management Tool", details: "QA TestPoint Analytics" },
    ],
    kpis,
    previousKpis,
    organization: orgRows,
    defects: {
      identified: defects.length,
      open: defects.length,
      fixedVsPrevious,
      fixRate,
      bySeverity,
      byModule,
      items: defects,
      qualityKpis: [
        { kpi: "Defects Identified", value: String(defects.length) },
        { kpi: "Defects still open", value: String(defects.length) },
        { kpi: "Defects fixed vs previous", value: input.previous ? String(fixedVsPrevious) : "—" },
        { kpi: "Defect Fix Rate", value: fixRate == null ? "—" : formatPctPoints(fixRate) },
        { kpi: "Critical Flow Coverage", value: formatPctPoints(kpis.executionRate) },
        { kpi: "End-to-End Coverage", value: e2eCoverage },
        { kpi: "Production-like Validation", value: prodLike },
        { kpi: "QA Validation Confidence", value: qaConfidence },
      ],
    },
    highlights,
    analysis,
    comparison,
    risks,
    conclusion,
    signOff,
    signedOff,
    cases: input.cases.map((item) => ({
      id: item.id,
      name: item.name,
      module: inferModule(item.name, item.id),
      status: item.status,
      testPoints: item.steps.length,
      durationMs: item.durationMs,
    })),
  };
}

