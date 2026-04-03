/**
 * Statistics calculator class
 * Comprehensive statistics including percentiles, outlier removal, and distribution analysis
 */

import { OutlierDetector } from './outlier-detector.js';
import { DistributionAnalyzer } from './distribution-analyzer.js';
import { round, calculatePercentile } from './math-utils.js';
import type { Percentiles, StatisticsResult } from '../types/index.js';

interface CalculateOptions {
    removeOutliers?: boolean;
    outlierMethod?: 'iqr' | 'zscore' | 'mad';
    includeDistribution?: boolean;
}

export class StatisticsCalculator {
    /**
     * Perform comprehensive statistical calculation
     * @param durations - Array of execution times (milliseconds)
     * @param options - Calculation options
     * @returns Statistics result or null if input is empty
     */
    static calculate(durations: number[], options: CalculateOptions = {}): StatisticsResult | null {
        const {
            removeOutliers = false,
            outlierMethod = 'iqr',
            includeDistribution = true
        } = options;

        if (!durations || durations.length === 0) {
            return null;
        }

        const sorted = [...durations].sort((a, b) => a - b);
        let filtered = sorted;
        let outliers: number[] = [];

        // Outlier removal
        if (removeOutliers) {
            const result = OutlierDetector.detectAndRemoveOutliers(sorted, outlierMethod);
            filtered = result.filtered;
            outliers = result.outliers;
        }

        // Basic statistics
        const count = filtered.length;
        const sum = filtered.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const min = filtered[0];
        const max = filtered[filtered.length - 1];

        // Variance and standard deviation (sample variance: N-1 for unbiased estimation)
        const variance = count > 1
            ? filtered.reduce((s, val) => s + Math.pow(val - mean, 2), 0) / (count - 1)
            : 0;
        const stdDev = Math.sqrt(variance);

        // Coefficient of Variation (guard against mean === 0)
        const cv = mean !== 0 ? (stdDev / mean) * 100 : 0;

        // Percentiles
        const percentiles: Percentiles = {
            p01: calculatePercentile(filtered, 1)!,
            p05: calculatePercentile(filtered, 5)!,
            p10: calculatePercentile(filtered, 10)!,
            p25: calculatePercentile(filtered, 25)!,
            p50: calculatePercentile(filtered, 50)!, // median
            p75: calculatePercentile(filtered, 75)!,
            p90: calculatePercentile(filtered, 90)!,
            p95: calculatePercentile(filtered, 95)!,
            p99: calculatePercentile(filtered, 99)!,
            p999: calculatePercentile(filtered, 99.9)!
        };

        const result: StatisticsResult = {
            count: {
                total: durations.length,
                included: count,
                outliers: outliers.length
            },
            basic: {
                min: round(min, 3)!,
                max: round(max, 3)!,
                mean: round(mean, 3)!,
                median: round(percentiles.p50, 3)!,
                sum: round(sum, 3)!
            },
            spread: {
                range: round(max - min, 3)!,
                variance: round(variance, 3)!,
                stdDev: round(stdDev, 3)!,
                cv: round(cv, 2)!, // %
                iqr: round(percentiles.p75 - percentiles.p25, 3)!
            },
            percentiles: Object.fromEntries(
                Object.entries(percentiles).map(([key, val]) =>
                    [key, round(val, 3)!]
                )
            ) as unknown as Percentiles,
            outliers: removeOutliers ? {
                count: outliers.length,
                percentage: round((outliers.length / durations.length) * 100, 2)!,
                values: outliers.map(v => round(v, 3)!),
                method: outlierMethod
            } : null
        };

        // Distribution information
        if (includeDistribution) {
            result.distribution = DistributionAnalyzer.calculateDistribution(filtered);
        }

        return result;
    }

}
