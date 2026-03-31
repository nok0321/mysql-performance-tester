import { describe, it, expect } from 'vitest';
import { computeComparisonDelta } from '../../lib/utils/comparison-delta.js';
import type { StatisticsResult } from '../../lib/types/index.js';

/**
 * Helper to create a minimal StatisticsResult for testing.
 * Only the fields used by computeComparisonDelta are meaningful.
 */
function makeStats(overrides: {
  mean?: number;
  median?: number;
  p50?: number;
  p95?: number;
  p99?: number;
}): StatisticsResult {
  return {
    count: { total: 10, included: 10, outliers: 0 },
    basic: {
      min: 0,
      max: 100,
      mean: overrides.mean ?? 10,
      median: overrides.median ?? 10,
      sum: 100,
    },
    spread: {
      range: 100,
      variance: 25,
      stdDev: 5,
      cv: 0.5,
      iqr: 10,
    },
    percentiles: {
      p01: 1,
      p05: 2,
      p10: 3,
      p25: 5,
      p50: overrides.p50 ?? 10,
      p75: 15,
      p90: 18,
      p95: overrides.p95 ?? 20,
      p99: overrides.p99 ?? 25,
      p999: 30,
    },
    outliers: null,
  };
}

describe('computeComparisonDelta', () => {
  it('should compute deltas between two different results', () => {
    const statsA = makeStats({ mean: 10, median: 9, p50: 9, p95: 20, p99: 25 });
    const statsB = makeStats({ mean: 15, median: 14, p50: 14, p95: 30, p99: 35 });

    const delta = computeComparisonDelta(statsA, statsB);

    expect(delta.meanDiff).toBe(5);
    expect(delta.meanDiffPercent).toBeCloseTo(50, 5);
    expect(delta.medianDiff).toBe(5);
    expect(delta.medianDiffPercent).toBeCloseTo(55.5556, 2);
    expect(delta.p50Diff).toBe(5);
    expect(delta.p95Diff).toBe(10);
    expect(delta.p99Diff).toBe(10);
  });

  it('should determine A as winner when B is slower', () => {
    const statsA = makeStats({ mean: 10 });
    const statsB = makeStats({ mean: 15 });

    const delta = computeComparisonDelta(statsA, statsB);
    // B is slower (higher latency), so A wins
    expect(delta.winner).toBe('A');
    expect(delta.summary).toContain('Query A');
    expect(delta.summary).toContain('faster');
  });

  it('should determine B as winner when A is slower', () => {
    const statsA = makeStats({ mean: 20 });
    const statsB = makeStats({ mean: 10 });

    const delta = computeComparisonDelta(statsA, statsB);
    // meanDiff = 10 - 20 = -10, B is faster
    expect(delta.winner).toBe('B');
    expect(delta.meanDiff).toBe(-10);
    expect(delta.summary).toContain('Query B');
    expect(delta.summary).toContain('faster');
  });

  it('should report tie when difference is under 1%', () => {
    const statsA = makeStats({ mean: 100 });
    const statsB = makeStats({ mean: 100.5 }); // 0.5% diff

    const delta = computeComparisonDelta(statsA, statsB);
    expect(delta.winner).toBe('tie');
    expect(delta.summary).toContain('similarly');
  });

  it('should report tie for identical results', () => {
    const stats = makeStats({ mean: 10, median: 10, p50: 10, p95: 20, p99: 25 });

    const delta = computeComparisonDelta(stats, stats);
    expect(delta.winner).toBe('tie');
    expect(delta.meanDiff).toBe(0);
    expect(delta.meanDiffPercent).toBe(0);
    expect(delta.medianDiff).toBe(0);
    expect(delta.p50Diff).toBe(0);
    expect(delta.p95Diff).toBe(0);
    expect(delta.p99Diff).toBe(0);
  });

  it('should handle zero mean in A (avoid division by zero)', () => {
    const statsA = makeStats({ mean: 0, median: 0, p50: 0, p95: 0, p99: 0 });
    const statsB = makeStats({ mean: 10, median: 10, p50: 10, p95: 20, p99: 25 });

    const delta = computeComparisonDelta(statsA, statsB);
    // pctDiff returns 0 when a=0
    expect(delta.meanDiffPercent).toBe(0);
    expect(delta.medianDiffPercent).toBe(0);
    expect(delta.p50DiffPercent).toBe(0);
    expect(delta.p95DiffPercent).toBe(0);
    expect(delta.p99DiffPercent).toBe(0);
    // With 0% diff, winner is tie
    expect(delta.winner).toBe('tie');
  });

  it('should handle both means being zero', () => {
    const stats = makeStats({ mean: 0 });
    const delta = computeComparisonDelta(stats, stats);
    expect(delta.meanDiff).toBe(0);
    expect(delta.meanDiffPercent).toBe(0);
    expect(delta.winner).toBe('tie');
  });

  it('should produce negative diffs when B is faster', () => {
    const statsA = makeStats({ mean: 50, median: 48, p50: 48, p95: 90, p99: 100 });
    const statsB = makeStats({ mean: 25, median: 24, p50: 24, p95: 45, p99: 50 });

    const delta = computeComparisonDelta(statsA, statsB);
    expect(delta.meanDiff).toBeLessThan(0);
    expect(delta.medianDiff).toBeLessThan(0);
    expect(delta.p50Diff).toBeLessThan(0);
    expect(delta.p95Diff).toBeLessThan(0);
    expect(delta.p99Diff).toBeLessThan(0);
    expect(delta.meanDiffPercent).toBeCloseTo(-50, 5);
  });

  it('should include percentage in summary', () => {
    const statsA = makeStats({ mean: 10 });
    const statsB = makeStats({ mean: 20 });

    const delta = computeComparisonDelta(statsA, statsB);
    // 100% difference
    expect(delta.summary).toContain('100.0%');
  });

  it('should exactly hit the 1% boundary for tie detection', () => {
    // Exactly 1% difference should NOT be a tie
    const statsA = makeStats({ mean: 100 });
    const statsB = makeStats({ mean: 101 }); // exactly 1%

    const delta = computeComparisonDelta(statsA, statsB);
    expect(delta.meanDiffPercent).toBeCloseTo(1, 5);
    expect(delta.winner).toBe('A');
  });

  it('should treat just under 1% as tie', () => {
    const statsA = makeStats({ mean: 100 });
    const statsB = makeStats({ mean: 100.99 }); // 0.99%

    const delta = computeComparisonDelta(statsA, statsB);
    expect(Math.abs(delta.meanDiffPercent)).toBeLessThan(1);
    expect(delta.winner).toBe('tie');
  });
});
