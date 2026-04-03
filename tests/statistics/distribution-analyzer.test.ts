import { describe, it, expect } from 'vitest';
import { DistributionAnalyzer } from '../../lib/statistics/distribution-analyzer.js';
import { round } from '../../lib/statistics/math-utils.js';

describe('DistributionAnalyzer', () => {
    describe('calculateDistribution', () => {
        it('creates histogram bins using Sturges rule', () => {
            const data = Array.from({ length: 100 }, (_, i) => i + 1);
            const result = DistributionAnalyzer.calculateDistribution(data);

            expect(result.bins.length).toBe(result.binCount);
            expect(result.binWidth).toBeGreaterThan(0);
        });

        it('uses custom bin count', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = DistributionAnalyzer.calculateDistribution(data, 5);

            expect(result.bins.length).toBe(5);
        });

        it('bins sum to total count', () => {
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = DistributionAnalyzer.calculateDistribution(data);

            const totalCount = result.bins.reduce((sum, bin) => sum + bin.count, 0);
            expect(totalCount).toBe(data.length);
        });

        it('percentages sum to approximately 100', () => {
            const data = Array.from({ length: 50 }, (_, i) => i + 1);
            const result = DistributionAnalyzer.calculateDistribution(data);

            const totalPercentage = result.bins.reduce((sum, bin) => sum + bin.percentage, 0);
            expect(totalPercentage).toBeCloseTo(100, 0);
        });

        it('each bin has start, end, count, percentage', () => {
            const data = [1, 2, 3, 4, 5];
            const result = DistributionAnalyzer.calculateDistribution(data);

            for (const bin of result.bins) {
                expect(bin).toHaveProperty('start');
                expect(bin).toHaveProperty('end');
                expect(bin).toHaveProperty('count');
                expect(bin).toHaveProperty('percentage');
            }
        });

        it('bins are contiguous (end of one = start of next)', () => {
            const data = Array.from({ length: 20 }, (_, i) => i + 1);
            const result = DistributionAnalyzer.calculateDistribution(data);

            for (let i = 1; i < result.bins.length; i++) {
                expect(result.bins[i].start).toBeCloseTo(result.bins[i - 1].end, 2);
            }
        });
    });

    describe('round', () => {
        it('rounds correctly', () => {
            expect(round(3.14159, 2)).toBe(3.14);
        });

        it('returns null for null/NaN', () => {
            expect(round(null as unknown as number, 2)).toBeNull();
            expect(round(NaN, 2)).toBeNull();
        });
    });
});
