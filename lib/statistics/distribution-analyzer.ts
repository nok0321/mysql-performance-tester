/**
 * Distribution analysis class
 * Histogram and data distribution analysis
 */

import type { Distribution, DistributionBin } from '../types/index.js';

export class DistributionAnalyzer {
    /**
     * Calculate distribution (histogram)
     * @param sortedArray - Pre-sorted numeric array
     * @param binCount - Number of bins (uses Sturges' rule if null)
     * @returns Distribution with bins, binCount, and binWidth
     */
    static calculateDistribution(sortedArray: number[], binCount: number | null = null): Distribution {
        if (!binCount) {
            // Use Sturges' rule
            binCount = Math.ceil(Math.log2(sortedArray.length) + 1);
        }

        const min = sortedArray[0];
        const max = sortedArray[sortedArray.length - 1];
        const binWidth = (max - min) / binCount;

        const bins: DistributionBin[] = Array(binCount).fill(0).map((_, i) => ({
            start: min + i * binWidth,
            end: min + (i + 1) * binWidth,
            count: 0,
            percentage: 0
        }));

        sortedArray.forEach(val => {
            const binIndex = Math.min(
                Math.floor((val - min) / binWidth),
                binCount! - 1
            );
            bins[binIndex].count++;
        });

        bins.forEach(bin => {
            bin.percentage = this.round((bin.count / sortedArray.length) * 100, 2)!;
            bin.start = this.round(bin.start, 3)!;
            bin.end = this.round(bin.end, 3)!;
        });

        return {
            bins,
            binCount,
            binWidth: this.round(binWidth, 3)!
        };
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
