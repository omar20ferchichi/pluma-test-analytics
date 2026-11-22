import type { QualityWeights, TestStatus } from "../types.js";
import { DEFAULT_QUALITY_WEIGHTS } from "../types.js";

export interface QualityInputs {
  passRate: number;
  failed: number;
  criticalFailures: number;
  regressions: number;
  flakinessScore: number;
  performanceRegressions: number;
  coverageScore: number;
  weights?: Partial<QualityWeights>;
}

export function computeQualityScore(input: QualityInputs): {
  score: number;
  breakdown: Record<string, number>;
} {
  const weights = { ...DEFAULT_QUALITY_WEIGHTS, ...input.weights };
  const totalWeight =
    weights.passRate +
    weights.criticalFailures +
    weights.regressions +
    weights.flakiness +
    weights.performance +
    weights.coverage;

  const pass = clamp(input.passRate) * weights.passRate;
  const critical = (1 - clamp(input.criticalFailures / Math.max(1, input.failed || input.criticalFailures))) * weights.criticalFailures;
  const regressions = (1 - clamp(input.regressions / 10)) * weights.regressions;
  const flakiness = (1 - clamp(input.flakinessScore)) * weights.flakiness;
  const performance = (1 - clamp(input.performanceRegressions / 8)) * weights.performance;
  const coverage = clamp(input.coverageScore) * weights.coverage;

  const raw = pass + critical + regressions + flakiness + performance + coverage;
  const score = Math.round((raw / totalWeight) * 1000) / 10;

  return {
    score,
    breakdown: {
      passRate: round(pass),
      criticalFailures: round(critical),
      regressions: round(regressions),
      flakiness: round(flakiness),
      performance: round(performance),
      coverage: round(coverage),
    },
  };
}

export function flakinessScore(history: TestStatus[]): number {
  if (history.length < 2) return 0;
  let transitions = 0;
  for (let i = 1; i < history.length; i += 1) {
    const prevFail = isFail(history[i - 1]!);
    const currFail = isFail(history[i]!);
    if (prevFail !== currFail) transitions += 1;
  }
  const failCount = history.filter(isFail).length;
  if (failCount === 0 || failCount === history.length) return 0;
  return clamp(transitions / (history.length - 1));
}

export function classifyHistory(history: TestStatus[], durations: number[]): {
  newFailure: boolean;
  regression: boolean;
  flaky: boolean;
  slowdown: boolean;
  flakinessScore: number;
  durationDeltaPct?: number;
} {
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const latestFail = latest ? isFail(latest) : false;
  const previousFail = previous ? isFail(previous) : false;
  const flake = flakinessScore(history);
  const recent = history.slice(-8);
  const recentFails = recent.filter(isFail).length;
  const older = history.slice(0, -8);
  const olderFailRate = older.length ? older.filter(isFail).length / older.length : 0;

  let durationDeltaPct: number | undefined;
  let slowdown = false;
  if (durations.length >= 2) {
    const current = durations[durations.length - 1] ?? 0;
    const baseline = median(durations.slice(0, -1));
    if (baseline > 0) {
      durationDeltaPct = ((current - baseline) / baseline) * 100;
      slowdown = current > baseline * 1.5 && current - baseline >= 2000;
    }
  }

  return {
    newFailure: Boolean(latestFail && previous && !previousFail),
    regression: Boolean(latestFail && older.length >= 3 && olderFailRate < 0.2 && recentFails >= 2),
    flaky: flake >= 0.3,
    slowdown,
    flakinessScore: flake,
    durationDeltaPct,
  };
}

function isFail(status: TestStatus): boolean {
  return status === "failed" || status === "timedOut";
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}
