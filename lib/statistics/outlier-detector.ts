/**
 * Outlier detection class
 * Detects and removes outliers using multiple statistical methods
 */

import { round, calculatePercentile } from './math-utils.js';

interface OutlierResult {
    filtered: number[];
    outliers: number[];
    bounds?: {
        lower: number | null;
        upper: number | null;
    };
}

export class OutlierDetector {
    /**
     * Detect and remove outliers from a sorted array
     * @param sortedArray - Pre-sorted numeric array
     * @param method - Detection method ('iqr', 'zscore', 'mad')
     * @returns Filtered data with outlier information
     */
    static detectAndRemoveOutliers(
        sortedArray: number[],
        method: 'iqr' | 'zscore' | 'mad' = 'iqr'
    ): OutlierResult {
        if (method === 'iqr') {
            return this.removeOutliersIQR(sortedArray);
        } else if (method === 'zscore') {
            return this.removeOutliersZScore(sortedArray);
        } else if (method === 'mad') {
            return this.removeOutliersMAD(sortedArray);
        }

        throw new Error(`Unknown outlier detection method: ${method}`);
    }

    /**
     * Remove outliers using the IQR method
     * @param sortedArray - Pre-sorted numeric array
     * @param multiplier - IQR multiplier (default 1.5)
     * @returns Filtered data with outlier information and bounds
     */
    static removeOutliersIQR(sortedArray: number[], multiplier: number = 1.5): OutlierResult {
        const q1 = calculatePercentile(sortedArray, 25);
        const q3 = calculatePercentile(sortedArray, 75);
        const iqr = q3! - q1!;

        const lowerBound = q1! - multiplier * iqr;
        const upperBound = q3! + multiplier * iqr;

        const filtered: number[] = [];
        const outliers: number[] = [];

        sortedArray.forEach(val => {
            if (val >= lowerBound && val <= upperBound) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return {
            filtered,
            outliers,
            bounds: {
                lower: round(lowerBound, 3),
                upper: round(upperBound, 3)
            }
        };
    }

    /**
     * Remove outliers using the Z-score method
     * @param sortedArray - Pre-sorted numeric array
     * @param threshold - Z-score threshold (default 3)
     * @returns Filtered data with outlier information
     */
    static removeOutliersZScore(sortedArray: number[], threshold: number = 3): OutlierResult {
        const mean = sortedArray.reduce((a, b) => a + b, 0) / sortedArray.length;
        const stdDev = Math.sqrt(
            sortedArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            sortedArray.length
        );

        const filtered: number[] = [];
        const outliers: number[] = [];

        sortedArray.forEach(val => {
            const zScore = Math.abs((val - mean) / stdDev);
            if (zScore <= threshold) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return { filtered, outliers };
    }

    /**
     * Remove outliers using the MAD method (robust approach)
     * @param sortedArray - Pre-sorted numeric array
     * @param threshold - Modified Z-score threshold (default 3.5)
     * @returns Filtered data with outlier information
     */
    static removeOutliersMAD(sortedArray: number[], threshold: number = 3.5): OutlierResult {
        const median = calculatePercentile(sortedArray, 50)!;
        const deviations = sortedArray.map(val => Math.abs(val - median));
        const madValue = calculatePercentile(deviations.sort((a, b) => a - b), 50)!;

        // Modified Z-score = 0.6745 * (x - median) / MAD
        const filtered: number[] = [];
        const outliers: number[] = [];

        sortedArray.forEach(val => {
            const modifiedZScore = 0.6745 * Math.abs(val - median) / madValue;
            if (modifiedZScore <= threshold) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return { filtered, outliers };
    }

}
