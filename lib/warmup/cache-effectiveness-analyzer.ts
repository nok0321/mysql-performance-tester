/**
 * Cache effectiveness analysis class.
 * Analyzes cache effectiveness from warmup execution results.
 */

/** Result of a single warmup iteration */
export interface WarmupIterationResult {
    iteration: number;
    duration?: number;
    error?: string;
    success: boolean;
    timestamp: string;
}

/** Trend analysis result */
export interface TrendAnalysis {
    type: 'decreasing' | 'increasing' | 'stable' | 'fluctuating';
    group1Avg: number | null;
    group2Avg: number | null;
    group3Avg: number | null;
}

/** Cache effectiveness analysis result */
export interface CacheEffectivenessResult {
    firstHalfAvg: number | null;
    secondHalfAvg: number | null;
    improvementPercentage: number | null;
    effectivenessRating: string;
    trend: TrendAnalysis;
    recommendation: string;
}

export class CacheEffectivenessAnalyzer {
    /**
     * Analyze cache effectiveness.
     * @param results - Warmup execution results
     * @returns Cache effectiveness analysis result, or null if insufficient data
     */
    static analyze(results: WarmupIterationResult[]): CacheEffectivenessResult | null {
        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length < 2) {
            return null;
        }

        const durations = successfulResults.map(r => r.duration!);

        // Compare first half vs second half
        const halfPoint = Math.ceil(durations.length / 2);
        const firstHalf = durations.slice(0, halfPoint);
        const secondHalf = durations.slice(halfPoint);

        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        // Calculate improvement rate
        const improvement = ((avgFirst - avgSecond) / avgFirst) * 100;

        // Trend analysis (simplified linear regression)
        const trend = this.analyzeTrend(durations);

        return {
            firstHalfAvg: this.round(avgFirst, 2),
            secondHalfAvg: this.round(avgSecond, 2),
            improvementPercentage: this.round(improvement, 2),
            effectivenessRating: this.rateEffectiveness(improvement),
            trend: trend,
            recommendation: this.generateRecommendation(improvement, trend)
        };
    }

    /**
     * Analyze trend (simplified version).
     * @param durations - Array of execution durations
     * @returns Trend analysis result
     */
    static analyzeTrend(durations: number[]): TrendAnalysis {
        // Split into 3 groups and calculate averages
        const n = durations.length;
        const groupSize = Math.floor(n / 3);

        const group1 = durations.slice(0, groupSize);
        const group2 = durations.slice(groupSize, groupSize * 2);
        const group3 = durations.slice(groupSize * 2);

        const avg1 = group1.reduce((a, b) => a + b, 0) / group1.length;
        const avg2 = group2.reduce((a, b) => a + b, 0) / group2.length;
        const avg3 = group3.reduce((a, b) => a + b, 0) / group3.length;

        // Determine trend type
        let trendType: TrendAnalysis['type'];
        if (avg1 > avg2 && avg2 > avg3) {
            trendType = 'decreasing'; // Improving
        } else if (avg1 < avg2 && avg2 < avg3) {
            trendType = 'increasing'; // Degrading
        } else if (Math.abs(avg1 - avg3) < avg1 * 0.1) {
            trendType = 'stable'; // Stable
        } else {
            trendType = 'fluctuating'; // Fluctuating
        }

        return {
            type: trendType,
            group1Avg: this.round(avg1, 2),
            group2Avg: this.round(avg2, 2),
            group3Avg: this.round(avg3, 2)
        };
    }

    /**
     * Rate cache effectiveness.
     * @param improvementPercentage - Improvement rate (%)
     * @returns Effectiveness rating string
     */
    static rateEffectiveness(improvementPercentage: number): string {
        if (improvementPercentage > 50) {
            return 'Excellent (キャッシュ効果が非常に高い)';
        } else if (improvementPercentage > 30) {
            return 'Good (キャッシュ効果が高い)';
        } else if (improvementPercentage > 10) {
            return 'Fair (キャッシュ効果あり)';
        } else if (improvementPercentage > 0) {
            return 'Low (キャッシュ効果が低い)';
        } else {
            return 'None (キャッシュ効果なし)';
        }
    }

    /**
     * Generate recommendations.
     * @param improvement - Improvement rate
     * @param trend - Trend information
     * @returns Recommendation string
     */
    static generateRecommendation(improvement: number, trend: TrendAnalysis): string {
        if (improvement > 30 && trend.type === 'decreasing') {
            return 'ウォームアップが効果的です。現在の設定を維持してください。';
        } else if (improvement > 10 && trend.type === 'decreasing') {
            return 'ある程度の効果があります。ウォームアップ回数を増やすことを検討してください。';
        } else if (improvement < 10) {
            return 'ウォームアップの効果が限定的です。データベースのキャッシュ設定を確認してください。';
        } else if (trend.type === 'fluctuating') {
            return '実行時間が不安定です。システムの負荷や他のプロセスの影響を確認してください。';
        } else {
            return 'ウォームアップを継続することを推奨します。';
        }
    }

    /**
     * Round a number to the specified decimal places.
     * @param value - Value to round
     * @param decimals - Number of decimal places
     * @returns Rounded value, or null if input is invalid
     */
    static round(value: number, decimals: number): number | null {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
