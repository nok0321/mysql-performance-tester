import { describe, it, expect } from 'vitest';
import { StatisticsCalculator } from '../../lib/statistics/statistics-calculator.js';

describe('StatisticsCalculator', () => {
    describe('calculate', () => {
        it('returns null for empty array', () => {
            expect(StatisticsCalculator.calculate([])).toBeNull();
        });

        it('returns null for null input', () => {
            expect(StatisticsCalculator.calculate(null as unknown as number[])).toBeNull();
        });

        it('calculates basic statistics correctly', () => {
            const data = [1, 2, 3, 4, 5];
            const result = StatisticsCalculator.calculate(data);

            expect(result!.basic.min).toBe(1);
            expect(result!.basic.max).toBe(5);
            expect(result!.basic.mean).toBe(3);
            expect(result!.basic.median).toBe(3);
            expect(result!.basic.sum).toBe(15);
        });

        it('calculates spread statistics correctly', () => {
            const data: number[] = [2, 4, 4, 4, 5, 5, 7, 9];
            const result = StatisticsCalculator.calculate(data);

            expect(result!.spread.range).toBe(7);
            expect(result!.spread.variance).toBeGreaterThan(0);
            expect(result!.spread.stdDev).toBeGreaterThan(0);
            expect(result!.spread.cv).toBeGreaterThan(0);
            expect(result!.spread.iqr).toBeGreaterThan(0);
        });

        it('calculates count correctly', () => {
            const data: number[] = [1, 2, 3, 4, 5];
            const result = StatisticsCalculator.calculate(data);

            expect(result!.count.total).toBe(5);
            expect(result!.count.included).toBe(5);
            expect(result!.count.outliers).toBe(0);
        });

        it('includes percentiles', () => {
            const data: number[] = Array.from({ length: 100 }, (_, i) => i + 1);
            const result = StatisticsCalculator.calculate(data);

            expect(result!.percentiles.p50).toBeCloseTo(50.5, 0);
            expect(result!.percentiles.p90).toBeCloseTo(90.1, 0);
            expect(result!.percentiles.p99).toBeCloseTo(99, 0);
        });

        it('includes distribution by default', () => {
            const data: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = StatisticsCalculator.calculate(data);

            expect(result!.distribution).toBeDefined();
            expect(result!.distribution!.bins.length).toBeGreaterThan(0);
        });

        it('excludes distribution when option is false', () => {
            const data: number[] = [1, 2, 3, 4, 5];
            const result = StatisticsCalculator.calculate(data, { includeDistribution: false });

            expect(result!.distribution).toBeUndefined();
        });

        it('removes outliers with IQR method', () => {
            const data: number[] = [1, 2, 3, 4, 5, 100];
            const result = StatisticsCalculator.calculate(data, {
                removeOutliers: true,
                outlierMethod: 'iqr',
            });

            expect(result!.outliers).toBeDefined();
            expect(result!.outliers!.count).toBeGreaterThan(0);
            expect(result!.outliers!.method).toBe('iqr');
            expect(result!.count.included).toBeLessThan(result!.count.total);
        });

        it('calculates sample variance with N-1 (Bessel correction)', () => {
            // [2, 4, 4, 4, 5, 5, 7, 9] — mean = 5
            // Sum of squared deviations = 9+1+1+1+0+0+4+16 = 32
            // Sample variance = 32 / (8-1) = 32/7 ≈ 4.571
            const data = [2, 4, 4, 4, 5, 5, 7, 9];
            const result = StatisticsCalculator.calculate(data, { includeDistribution: false });

            expect(result!.spread.variance).toBeCloseTo(4.571, 2);
            expect(result!.spread.stdDev).toBeCloseTo(Math.sqrt(32 / 7), 2);
        });

        it('handles single-element array (variance = 0)', () => {
            const result = StatisticsCalculator.calculate([42], { includeDistribution: false });

            expect(result!.basic.min).toBe(42);
            expect(result!.basic.max).toBe(42);
            expect(result!.basic.mean).toBe(42);
            expect(result!.spread.variance).toBe(0);
            expect(result!.spread.stdDev).toBe(0);
        });

        it('handles unsorted input', () => {
            const result = StatisticsCalculator.calculate([5, 1, 3, 2, 4]);

            expect(result!.basic.min).toBe(1);
            expect(result!.basic.max).toBe(5);
        });
    });

    describe('calculatePercentile', () => {
        it('calculates P50 (median) correctly', () => {
            expect(StatisticsCalculator.calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
        });

        it('uses linear interpolation', () => {
            const result = StatisticsCalculator.calculatePercentile([10, 20, 30, 40], 25);
            expect(result).toBe(17.5);
        });

        it('returns single element for single-element array', () => {
            expect(StatisticsCalculator.calculatePercentile([42], 50)).toBe(42);
        });

        it('returns null for empty array', () => {
            expect(StatisticsCalculator.calculatePercentile([], 50)).toBeNull();
        });

        it('throws for invalid percentile', () => {
            expect(() => StatisticsCalculator.calculatePercentile([1], -1)).toThrow();
            expect(() => StatisticsCalculator.calculatePercentile([1], 101)).toThrow();
        });

        it('handles P0 and P100', () => {
            expect(StatisticsCalculator.calculatePercentile([1, 2, 3], 0)).toBe(1);
            expect(StatisticsCalculator.calculatePercentile([1, 2, 3], 100)).toBe(3);
        });
    });

    describe('round', () => {
        it('rounds to specified decimal places', () => {
            expect(StatisticsCalculator.round(3.14159, 2)).toBe(3.14);
            expect(StatisticsCalculator.round(3.14159, 3)).toBe(3.142);
        });

        it('returns null for null/undefined/NaN', () => {
            expect(StatisticsCalculator.round(null as unknown as number, 2)).toBeNull();
            expect(StatisticsCalculator.round(undefined as unknown as number, 2)).toBeNull();
            expect(StatisticsCalculator.round(NaN, 2)).toBeNull();
        });
    });
});
