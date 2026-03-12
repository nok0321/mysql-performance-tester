/**
 * 統計計算クラス
 * パーセンタイル、外れ値除外、分布分析などを含む包括的な統計機能
 */

import { OutlierDetector } from './outlier-detector.js';
import { DistributionAnalyzer } from './distribution-analyzer.js';

export class StatisticsCalculator {
    /**
     * 包括的な統計計算
     * @param {number[]} durations - 実行時間の配列（ミリ秒）
     * @param {Object} options - オプション設定
     * @returns {Object} 統計結果
     */
    static calculate(durations, options = {}) {
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
        let outliers = [];

        // 外れ値除外
        if (removeOutliers) {
            const result = OutlierDetector.detectAndRemoveOutliers(sorted, outlierMethod);
            filtered = result.filtered;
            outliers = result.outliers;
        }

        // 基本統計
        const count = filtered.length;
        const sum = filtered.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const min = filtered[0];
        const max = filtered[filtered.length - 1];

        // 分散と標準偏差
        const variance = filtered.reduce((sum, val) =>
            sum + Math.pow(val - mean, 2), 0) / count;
        const stdDev = Math.sqrt(variance);

        // 変動係数（Coefficient of Variation）
        const cv = (stdDev / mean) * 100;

        // パーセンタイル
        const percentiles = {
            p01: this.calculatePercentile(filtered, 1),
            p05: this.calculatePercentile(filtered, 5),
            p10: this.calculatePercentile(filtered, 10),
            p25: this.calculatePercentile(filtered, 25),
            p50: this.calculatePercentile(filtered, 50), // 中央値
            p75: this.calculatePercentile(filtered, 75),
            p90: this.calculatePercentile(filtered, 90),
            p95: this.calculatePercentile(filtered, 95),
            p99: this.calculatePercentile(filtered, 99),
            p999: this.calculatePercentile(filtered, 99.9)
        };

        const result = {
            count: {
                total: durations.length,
                included: count,
                outliers: outliers.length
            },
            basic: {
                min: this.round(min, 3),
                max: this.round(max, 3),
                mean: this.round(mean, 3),
                median: this.round(percentiles.p50, 3),
                sum: this.round(sum, 3)
            },
            spread: {
                range: this.round(max - min, 3),
                variance: this.round(variance, 3),
                stdDev: this.round(stdDev, 3),
                cv: this.round(cv, 2), // %
                iqr: this.round(percentiles.p75 - percentiles.p25, 3)
            },
            percentiles: Object.fromEntries(
                Object.entries(percentiles).map(([key, val]) =>
                    [key, this.round(val, 3)]
                )
            ),
            outliers: removeOutliers ? {
                count: outliers.length,
                percentage: this.round((outliers.length / durations.length) * 100, 2),
                values: outliers.map(v => this.round(v, 3)),
                method: outlierMethod
            } : null
        };

        // 分布情報
        if (includeDistribution) {
            result.distribution = DistributionAnalyzer.calculateDistribution(filtered);
        }

        return result;
    }

    /**
     * パーセンタイル計算（線形補間法）
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} percentile - パーセンタイル (0-100)
     * @returns {number} パーセンタイル値
     */
    static calculatePercentile(sortedArray, percentile) {
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

        // 線形補間
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * 数値の丸め
     * @param {number} value - 丸める値
     * @param {number} decimals - 小数点以下の桁数
     * @returns {number} 丸められた値
     */
    static round(value, decimals) {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
