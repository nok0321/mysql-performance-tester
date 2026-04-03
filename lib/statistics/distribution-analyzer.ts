/**
 * Distribution analysis class
 * Histogram and data distribution analysis
 */

import type { Distribution, DistributionBin } from '../types/index.js';
import { round } from './math-utils.js';

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

        // Guard: all values identical — return single bin
        if (max === min) {
            return {
                bins: [{
                    start: round(min, 3)!,
                    end: round(min, 3)!,
                    count: sortedArray.length,
                    percentage: 100
                }],
                binCount: 1,
                binWidth: 0
            };
        }

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
            bin.percentage = round((bin.count / sortedArray.length) * 100, 2)!;
            bin.start = round(bin.start, 3)!;
            bin.end = round(bin.end, 3)!;
        });

        return {
            bins,
            binCount,
            binWidth: round(binWidth, 3)!
        };
    }

}
