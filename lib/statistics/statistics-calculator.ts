/**
 * Statistics calculator class
 * Comprehensive statistics including percentiles, outlier removal, and distribution analysis
 */

import { OutlierDetector } from './outlier-detector.js';
import { DistributionAnalyzer } from './distribution-analyzer.js';
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

        // Coefficient of Variation
        const cv = (stdDev / mean) * 100;

        // Percentiles
        const percentiles: Percentiles = {
            p01: this.calculatePercentile(filtered, 1)!,
            p05: this.calculatePercentile(filtered, 5)!,
            p10: this.calculatePercentile(filtered, 10)!,
            p25: this.calculatePercentile(filtered, 25)!,
            p50: this.calculatePercentile(filtered, 50)!, // median
            p75: this.calculatePercentile(filtered, 75)!,
            p90: this.calculatePercentile(filtered, 90)!,
            p95: this.calculatePercentile(filtered, 95)!,
            p99: this.calculatePercentile(filtered, 99)!,
            p999: this.calculatePercentile(filtered, 99.9)!
        };

        const result: StatisticsResult = {
            count: {
                total: durations.length,
                included: count,
                outliers: outliers.length
            },
            basic: {
                min: this.round(min, 3)!,
                max: this.round(max, 3)!,
                mean: this.round(mean, 3)!,
                median: this.round(percentiles.p50, 3)!,
                sum: this.round(sum, 3)!
            },
            spread: {
                range: this.round(max - min, 3)!,
                variance: this.round(variance, 3)!,
                stdDev: this.round(stdDev, 3)!,
                cv: this.round(cv, 2)!, // %
                iqr: this.round(percentiles.p75 - percentiles.p25, 3)!
            },
            percentiles: Object.fromEntries(
                Object.entries(percentiles).map(([key, val]) =>
                    [key, this.round(val, 3)!]
                )
            ) as unknown as Percentiles,
            outliers: removeOutliers ? {
                count: outliers.length,
                percentage: this.round((outliers.length / durations.length) * 100, 2)!,
                values: outliers.map(v => this.round(v, 3)!),
                method: outlierMethod
            } : null
        };

        // Distribution information
        if (includeDistribution) {
            result.distribution = DistributionAnalyzer.calculateDistribution(filtered);
        }

        return result;
    }

    /**
     * Calculate percentile using linear interpolation
     * @param sortedArray - Pre-sorted numeric array
     * @param percentile - Percentile value (0-100)
     * @returns The percentile value
     */
    static calculatePercentile(sortedArray: number[], percentile: number): number | null {
        if (percentile < 0 || percentile > 100) {
            throw new Error('Percentile must be between 0 and 100');
        }

        if (sortedArray.length === 0) {
            return null;
        }

        if (sortedArray.length === 1) {
            return sortedArray[0];
        }

        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
            return sortedArray[lower];
        }

        // Linear interpolation
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Round a number to the specified decimal places
     * @param value - The value to round
     * @param decimals - Number of decimal places
     * @returns The rounded value
     */
    static round(value: number, decimals: number): number | null {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
