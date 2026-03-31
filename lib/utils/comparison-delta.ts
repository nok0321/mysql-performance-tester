/**
 * comparison-delta.ts - Pure function to compute delta metrics between two test results
 *
 * Used by the comparison mode to calculate performance differences
 * between Query A and Query B.
 */

import type { StatisticsResult } from '../types/index.js';

export interface ComparisonDelta {
  meanDiff: number;
  meanDiffPercent: number;
  medianDiff: number;
  medianDiffPercent: number;
  p50Diff: number;
  p50DiffPercent: number;
  p95Diff: number;
  p95DiffPercent: number;
  p99Diff: number;
  p99DiffPercent: number;
  winner: 'A' | 'B' | 'tie';
  summary: string;
}

/**
 * Compute the percentage difference: ((b - a) / a) * 100.
 * Returns 0 when `a` is 0 to avoid division by zero.
 */
function pctDiff(a: number, b: number): number {
  if (a === 0) return 0;
  return ((b - a) / a) * 100;
}

/**
 * Compute performance deltas between two StatisticsResult objects.
 *
 * Positive diff values mean B is slower (higher latency).
 * Negative diff values mean B is faster (lower latency).
 *
 * The winner is determined by mean latency. Differences under 1% are a tie.
 */
export function computeComparisonDelta(
  statsA: StatisticsResult,
  statsB: StatisticsResult
): ComparisonDelta {
  const meanA = statsA.basic.mean;
  const meanB = statsB.basic.mean;
  const medianA = statsA.basic.median;
  const medianB = statsB.basic.median;
  const p50A = statsA.percentiles.p50;
  const p50B = statsB.percentiles.p50;
  const p95A = statsA.percentiles.p95;
  const p95B = statsB.percentiles.p95;
  const p99A = statsA.percentiles.p99;
  const p99B = statsB.percentiles.p99;

  const meanDiff = meanB - meanA;
  const meanDiffPercent = pctDiff(meanA, meanB);

  // Determine winner based on mean latency (lower = better)
  let winner: 'A' | 'B' | 'tie' = 'tie';
  if (Math.abs(meanDiffPercent) >= 1) {
    winner = meanDiff < 0 ? 'B' : 'A';
  }

  // Build human-readable summary
  let summary: string;
  if (winner === 'tie') {
    summary = `Both queries perform similarly (${Math.abs(meanDiffPercent).toFixed(1)}% difference)`;
  } else {
    const faster = winner;
    summary = `Query ${faster} is ${Math.abs(meanDiffPercent).toFixed(1)}% faster (mean: ${Math.abs(meanDiff).toFixed(2)}ms)`;
  }

  return {
    meanDiff,
    meanDiffPercent,
    medianDiff: medianB - medianA,
    medianDiffPercent: pctDiff(medianA, medianB),
    p50Diff: p50B - p50A,
    p50DiffPercent: pctDiff(p50A, p50B),
    p95Diff: p95B - p95A,
    p95DiffPercent: pctDiff(p95A, p95B),
    p99Diff: p99B - p99A,
    p99DiffPercent: pctDiff(p99A, p99B),
    winner,
    summary,
  };
}
