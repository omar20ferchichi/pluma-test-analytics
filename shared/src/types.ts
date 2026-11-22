export const TEST_STATUSES = [
  "passed",
  "failed",
  "skipped",
  "flaky",
  "blocked",
  "timedOut",
  "interrupted",
  "unknown",
] as const;

export type TestStatus = (typeof TEST_STATUSES)[number];

export const FAILURE_CATEGORIES = [
  "Assertion Failure",
  "Timeout",
  "Element Not Found",
  "Network Error",
  "Authentication",
  "API Failure",
  "Database/Data Issue",
  "Environment Issue",
  "Navigation Failure",
  "Unknown",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "UNKNOWN"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const ARTIFACT_KINDS = [
  "video",
  "screenshot",
  "log",
  "json",
  "trace",
  "trace-frame",
  "trace-index",
  "har",
  "html-report",
  "junit",
  "allure",
  "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
}

export interface ValidationReport {
  ok: boolean;
  format: string;
  issues: ValidationIssue[];
  detected: {
    jsonFiles: number;
    logFiles: number;
    videos: number;
    screenshots: number;
    traces: number;
    other: number;
  };
}

export interface ExecutionMetadata {
  name?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  browser?: string;
  environment?: string;
  branch?: string;
  commitSha?: string;
  pipeline?: string;
  ciProvider?: string;
  workers?: number;
  playwrightVersion?: string;
  projectName?: string;
  baseUrl?: string;
}

export interface NormalizedError {
  message: string;
  stack?: string;
  category: FailureCategory;
  fingerprint: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

export interface NormalizedStep {
  name: string;
  status: TestStatus;
  startedAt?: string;
  durationMs?: number;
  category?: string;
}

export interface NormalizedArtifact {
  kind: ArtifactKind;
  name: string;
  path: string;
  contentType?: string;
  testPointId?: string;
  testCaseId?: string;
  size?: number;
}

export interface NormalizedTestPoint {
  id: string;
  description: string;
  ticketId?: string;
  status: TestStatus;
  durationMs: number;
  startedAt?: string;
  finishedAt?: string;
  retries: number;
  browser?: string;
  environment?: string;
  lastSuccessfulStep?: string;
  error?: NormalizedError;
  steps: NormalizedStep[];
  artifacts: NormalizedArtifact[];
  raw: unknown;
}

export interface NormalizedTestCase {
  id: string;
  name: string;
  file?: string;
  ticketId?: string;
  status: TestStatus;
  durationMs: number;
  startedAt?: string;
  finishedAt?: string;
  retries: number;
  testPoints: NormalizedTestPoint[];
  error?: NormalizedError;
}

export interface NormalizedLogLine {
  timestamp?: string;
  level: LogLevel;
  message: string;
  testPointId?: string;
  testCaseId?: string;
  stackTrace?: string;
  raw: string;
  lineNumber: number;
}

export interface NormalizedExecution {
  sourceFormat: string;
  metadata: ExecutionMetadata;
  testCases: NormalizedTestCase[];
  logs: NormalizedLogLine[];
  artifacts: NormalizedArtifact[];
  rawJson?: unknown;
  validation: ValidationReport;
}

export interface QualityWeights {
  passRate: number;
  criticalFailures: number;
  regressions: number;
  flakiness: number;
  performance: number;
  coverage: number;
}

export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  passRate: 50,
  criticalFailures: 15,
  regressions: 15,
  flakiness: 10,
  performance: 5,
  coverage: 5,
};

export interface ExecutionSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  blocked: number;
  passRate: number;
  failureRate: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export interface FailureCluster {
  fingerprint: string;
  category: FailureCategory;
  sampleMessage: string;
  count: number;
  testPointIds: string[];
  testCaseIds: string[];
}

export interface RegressionFlags {
  newFailure: boolean;
  regression: boolean;
  flaky: boolean;
  slowdown: boolean;
  flakinessScore: number;
  durationDeltaPct?: number;
}

export interface CompareDelta {
  previousId: string;
  currentId: string;
  previous: ExecutionSummary;
  current: ExecutionSummary;
  newFailures: string[];
  fixedFailures: string[];
  stillFailing: string[];
  newTestPoints: string[];
  removedTestPoints: string[];
  statusChanges: Array<{
    testPointId: string;
    from: TestStatus;
    to: TestStatus;
  }>;
  performanceRegressions: Array<{
    testPointId: string;
    previousMs: number;
    currentMs: number;
    deltaPct: number;
  }>;
}

export const GENERIC_TESTPOINT_IDS = new Set(["TP", "tp", "TESTPOINT", "testpoint"]);
