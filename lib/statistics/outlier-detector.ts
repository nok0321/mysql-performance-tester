/**
 * Outlier detection class
 * Detects and removes outliers using multiple statistical methods
 */

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
        const q1 = this.calculatePercentile(sortedArray, 25);
        const q3 = this.calculatePercentile(sortedArray, 75);
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
                lower: this.round(lowerBound, 3),
                upper: this.round(upperBound, 3)
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
        const median = this.calculatePercentile(sortedArray, 50)!;
        const deviations = sortedArray.map(val => Math.abs(val - median));
        const madValue = this.calculatePercentile(deviations.sort((a, b) => a - b), 50)!;

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
