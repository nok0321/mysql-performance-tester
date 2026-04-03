/**
 * Shared math utility functions for statistics and analysis modules
 */

/**
 * Round a number to the specified decimal places
 * @param value - The value to round
 * @param decimals - Number of decimal places
 * @returns The rounded value, or null for NaN/null/undefined inputs
 */
export function round(value: number, decimals: number): number | null {
    if (value === null || value === undefined || isNaN(value)) {
        return null;
    }
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Calculate a percentile from a pre-sorted numeric array using linear interpolation
 * @param sortedArray - Pre-sorted numeric array
 * @param percentile - Percentile value (0-100)
 * @returns The percentile value, or null for empty arrays
 */
export function calculatePercentile(sortedArray: number[], percentile: number): number | null {
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
