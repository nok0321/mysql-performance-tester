import { describe, it, expect } from 'vitest';
import { OutlierDetector } from '../../lib/statistics/outlier-detector.js';
import { calculatePercentile } from '../../lib/statistics/math-utils.js';

describe('OutlierDetector', () => {
    const normalData: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const dataWithOutlier: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];

    describe('detectAndRemoveOutliers', () => {
        it('routes to IQR method by default', () => {
            const result = OutlierDetector.detectAndRemoveOutliers(normalData);
            expect(result.filtered).toBeDefined();
            expect(result.outliers).toBeDefined();
        });

        it('routes to zscore method', () => {
            const result = OutlierDetector.detectAndRemoveOutliers(normalData, 'zscore');
            expect(result.filtered).toBeDefined();
        });

        it('routes to mad method', () => {
            const result = OutlierDetector.detectAndRemoveOutliers(normalData, 'mad');
            expect(result.filtered).toBeDefined();
        });

        it('throws for unknown method', () => {
            expect(() => OutlierDetector.detectAndRemoveOutliers(normalData, 'invalid' as unknown as 'iqr'))
                .toThrow('Unknown outlier detection method');
        });
    });

    describe('removeOutliersIQR', () => {
        it('keeps normal data intact', () => {
            const result = OutlierDetector.removeOutliersIQR(normalData);
            expect(result.filtered).toEqual(normalData);
            expect(result.outliers).toEqual([]);
        });

        it('detects extreme outliers', () => {
            const result = OutlierDetector.removeOutliersIQR(dataWithOutlier);
            expect(result.outliers).toContain(100);
            expect(result.filtered).not.toContain(100);
        });

        it('returns bounds', () => {
            const result = OutlierDetector.removeOutliersIQR(normalData);
            expect(result.bounds).toBeDefined();
            expect(result.bounds!.lower).toBeDefined();
            expect(result.bounds!.upper).toBeDefined();
        });

        it('accepts custom multiplier', () => {
            const strict = OutlierDetector.removeOutliersIQR(normalData, 0.5);
            const loose = OutlierDetector.removeOutliersIQR(normalData, 3.0);
            expect(strict.filtered.length).toBeLessThanOrEqual(loose.filtered.length);
        });
    });

    describe('removeOutliersZScore', () => {
        it('keeps normal data intact', () => {
            const result = OutlierDetector.removeOutliersZScore(normalData);
            expect(result.filtered).toEqual(normalData);
        });

        it('detects extreme outliers with lower threshold', () => {
            // Z-score is sensitive to outliers inflating the mean/stddev,
            // so use a lower threshold to reliably detect outliers
            const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
            const result = OutlierDetector.removeOutliersZScore(data, 2.0);
            expect(result.outliers).toContain(100);
        });

        it('accepts custom threshold', () => {
            const strict = OutlierDetector.removeOutliersZScore(dataWithOutlier, 1.0);
            const loose = OutlierDetector.removeOutliersZScore(dataWithOutlier, 5.0);
            expect(strict.filtered.length).toBeLessThanOrEqual(loose.filtered.length);
        });
    });

    describe('removeOutliersMAD', () => {
        it('keeps normal data intact', () => {
            const result = OutlierDetector.removeOutliersMAD(normalData);
            expect(result.filtered.length).toBe(normalData.length);
        });

        it('detects extreme outliers', () => {
            const result = OutlierDetector.removeOutliersMAD(dataWithOutlier);
            expect(result.outliers).toContain(100);
        });
    });

    describe('calculatePercentile', () => {
        it('calculates correctly', () => {
            expect(calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
        });

        it('returns null for empty array', () => {
            expect(calculatePercentile([], 50)).toBeNull();
        });
    });
});
