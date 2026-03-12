/**
 * TestResult Model - テスト結果データモデル
 *
 * 単一テストの結果を管理するクラス
  *
 * 機能:
 * - 実行結果の蓄積
 * - 統計計算（StatisticsCalculatorとの連携）
 * - 各種分析結果の格納
 * - JSON形式でのエクスポート
 *
 * @module models/test-result
 */

import { StatisticsCalculator } from '../statistics/statistics-calculator.js';

/**
 * テスト結果クラス
 */
export class TestResult {
    /**
     * テスト結果を初期化
     * @param {string} testName - テスト名
     * @param {string} query - 実行したSQLクエリ
     */
    constructor(testName, query) {
        this.testName = testName;
        this.query = query;
        this.rawDurations = []; // 生データ（実行時間の配列、ミリ秒）
        this.results = []; // 各イテレーションの詳細結果
        this.statistics = null; // 統計情報
        this.warmupResult = null; // ウォームアップ結果
        this.bufferPoolAnalysis = null; // Buffer Pool分析結果
        this.optimizerTrace = null; // Optimizer Trace結果
        this.explainAnalyze = null; // EXPLAIN ANALYZE結果
        this.performanceSchemaMetrics = null; // Performance Schemaメトリクス
        this.parallelResults = null; // 並列実行結果
        this.timestamp = new Date().toISOString(); // テスト実行タイムスタンプ
    }

    /**
     * 実行結果を追加
     * @param {Object} result - 実行結果
     * @param {boolean} result.success - 成功/失敗
     * @param {number} result.duration - 実行時間（ミリ秒）
     * @param {number} [result.rowCount] - 取得行数
     * @param {string} [result.error] - エラーメッセージ
     * @param {string} result.timestamp - 実行タイムスタンプ
     */
    addResult(result) {
        this.results.push(result);
        if (result.success && result.duration) {
            this.rawDurations.push(result.duration);
        }
    }

    /**
     * 統計情報を計算（StatisticsCalculatorを使用）
     *
     * @param {Object} config - テスト設定オブジェクト
     * @param {boolean} config.removeOutliers - 外れ値除外フラグ
     * @param {string} config.outlierMethod - 外れ値検出方法
     * @returns {Object|null} 統計情報
     */
    calculateStatistics(config) {
        if (this.rawDurations.length === 0) {
            return null;
        }

        const options = {
            removeOutliers: config.removeOutliers !== undefined ? config.removeOutliers : true,
            outlierMethod: config.outlierMethod || 'iqr',
            includeDistribution: true
        };

        this.statistics = StatisticsCalculator.calculate(this.rawDurations, options);
        return this.statistics;
    }

    /**
     * 簡易形式の統計情報を計算
     *
     * @returns {Object|null} 簡易統計情報
     */
    calculateSimpleStatistics() {
        const successResults = this.results.filter(r => r.success);
        if (successResults.length === 0) {
            return null;
        }

        const durations = successResults.map(r => r.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const stdDev = Math.sqrt(
            durations.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / durations.length
        );

        return {
            success: successResults.length,
            failure: this.results.length - successResults.length,
            total: this.results.length,
            average: this.round(avg, 3),
            min: this.round(min, 3),
            max: this.round(max, 3),
            stdDev: this.round(stdDev, 3)
        };
    }

    /**
     * 数値を指定桁数で丸める
     *
     * @param {number} value - 値
     * @param {number} decimals - 小数点以下の桁数
     * @returns {number} 丸めた値
     */
    round(value, decimals) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * JSON形式で出力
     *
     * @returns {Object} JSON表現
     */
    toJSON() {
        return {
            testName: this.testName,
            query: this.query,
            timestamp: this.timestamp,
            warmup: this.warmupResult,
            statistics: this.statistics,
            simpleStatistics: this.calculateSimpleStatistics(),
            bufferPool: this.bufferPoolAnalysis,
            optimizerTrace: this.optimizerTrace,
            explainAnalyze: this.explainAnalyze,
            performanceSchema: this.performanceSchemaMetrics,
            parallelResults: this.parallelResults,
            rawResults: this.results
        };
    }

    /**
     * サマリー情報を取得
     * @returns {Object} サマリー情報
     */
    getSummary() {
        const successCount = this.results.filter(r => r.success).length;
        const failureCount = this.results.length - successCount;
        const successRate = this.results.length > 0
            ? (successCount / this.results.length) * 100
            : 0;

        return {
            testName: this.testName,
            totalExecutions: this.results.length,
            successCount,
            failureCount,
            successRate: this.round(successRate, 2),
            hasStatistics: this.statistics !== null,
            hasWarmup: this.warmupResult !== null,
            hasAnalysis: {
                bufferPool: this.bufferPoolAnalysis !== null,
                optimizerTrace: this.optimizerTrace !== null,
                explainAnalyze: this.explainAnalyze !== null,
                performanceSchema: this.performanceSchemaMetrics !== null
            }
        };
    }

    /**
     * 失敗した実行のエラー情報を取得
     * @returns {Array<Object>} エラー情報の配列
     */
    getErrors() {
        return this.results
            .filter(r => !r.success && r.error)
            .map(r => ({
                error: r.error,
                timestamp: r.timestamp,
                duration: r.duration
            }));
    }

    /**
     * 成功率を計算
     * @returns {number} 成功率（パーセント）
     */
    getSuccessRate() {
        if (this.results.length === 0) return 0;
        const successCount = this.results.filter(r => r.success).length;
        return this.round((successCount / this.results.length) * 100, 2);
    }

    /**
     * テスト実行時間の合計を取得
     * @returns {number} 合計実行時間（ミリ秒）
     */
    getTotalDuration() {
        return this.rawDurations.reduce((sum, duration) => sum + duration, 0);
    }
}

export default TestResult;
