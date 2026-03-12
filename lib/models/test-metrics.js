/**
 * TestMetrics Model - テスト指標データモデル
 *
 * テスト実行の指標データを保持
 *
 * 機能:
 * - QPS/TPS計算
 * - レイテンシ指標
 * - スループット指標
 * - 並列性能計算
 *
 * @module models/test-metrics
 */

/**
 * テスト指標クラス
 */
export class TestMetrics {
    /**
     * 指標を初期化
     * @param {Object} params - パラメータ
     * @param {string} params.testName - テスト名
     * @param {number} params.threadCount - スレッド数
     * @param {number} params.totalIterations - 総イテレーション数
     */
    constructor({ testName, threadCount, totalIterations }) {
        this.testName = testName;
        this.threadCount = threadCount;
        this.totalIterations = totalIterations;
        this.startTime = null;
        this.endTime = null;
        this.durations = []; // 実行時間の配列
        this.timestamps = []; // 各実行のタイムスタンプ
        this.errors = []; // エラー情報
        this.successCount = 0;
        this.failureCount = 0;
    }

    /**
     * テスト開始をマーク
     */
    markStart() {
        this.startTime = Date.now();
    }

    /**
     * テスト終了をマーク
     */
    markEnd() {
        this.endTime = Date.now();
    }

    /**
     * 実行結果を追加
     * @param {Object} result - 実行結果
     * @param {boolean} result.success - 成功/失敗
     * @param {number} result.duration - 実行時間（ミリ秒）
     * @param {string} [result.error] - エラーメッセージ
     * @param {number} [result.timestamp] - タイムスタンプ
     */
    addResult(result) {
        if (result.success) {
            this.successCount++;
            this.durations.push(result.duration);
        } else {
            this.failureCount++;
            if (result.error) {
                this.errors.push({
                    error: result.error,
                    timestamp: result.timestamp || Date.now(),
                    duration: result.duration
                });
            }
        }

        if (result.timestamp) {
            this.timestamps.push(result.timestamp);
        }
    }

    /**
     * QPS（Queries Per Second）を計算
     * @returns {number} QPS
     */
    calculateQPS() {
        if (!this.startTime || !this.endTime) {
            return 0;
        }

        const durationSeconds = (this.endTime - this.startTime) / 1000;
        if (durationSeconds === 0) {
            return 0;
        }

        return this.round(this.successCount / durationSeconds, 2);
    }

    /**
     * TPS（Transactions Per Second）を計算
     * QPSと同じ意味で使用（このプロジェクトでは単位を統一）
     * @returns {number} TPS
     */
    calculateTPS() {
        return this.calculateQPS();
    }

    /**
     * 平均レイテンシを計算
     * @returns {number} 平均レイテンシ
     */
    calculateAverageLatency() {
        if (this.durations.length === 0) {
            return 0;
        }

        const sum = this.durations.reduce((a, b) => a + b, 0);
        return this.round(sum / this.durations.length, 3);
    }

    /**
     * レイテンシ指標を計算
     * @returns {Object} レイテンシ指標
     */
    calculateLatencyMetrics() {
        if (this.durations.length === 0) {
            return {
                min: 0,
                max: 0,
                average: 0,
                median: 0,
                p95: 0,
                p99: 0
            };
        }

        const sorted = [...this.durations].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const average = this.calculateAverageLatency();
        const median = this.calculatePercentile(sorted, 50);
        const p95 = this.calculatePercentile(sorted, 95);
        const p99 = this.calculatePercentile(sorted, 99);

        return {
            min: this.round(min, 3),
            max: this.round(max, 3),
            average: this.round(average, 3),
            median: this.round(median, 3),
            p95: this.round(p95, 3),
            p99: this.round(p99, 3)
        };
    }

    /**
     * スループット指標を計算
     * @returns {Object} スループット指標
     */
    calculateThroughputMetrics() {
        const totalDurationSeconds = this.getTotalDurationSeconds();
        const qps = this.calculateQPS();
        const successRate = this.calculateSuccessRate();

        return {
            qps: this.round(qps, 2),
            tps: this.round(qps, 2), // 同一値
            totalDurationSeconds: this.round(totalDurationSeconds, 3),
            totalRequests: this.successCount + this.failureCount,
            successfulRequests: this.successCount,
            failedRequests: this.failureCount,
            successRate: this.round(successRate, 2),
            averageLatency: this.round(this.calculateAverageLatency(), 3)
        };
    }

    /**
     * 並列性能指標を計算
     * @returns {Object} 並列性能指標
     */
    calculateParallelPerformanceMetrics() {
        const latency = this.calculateLatencyMetrics();
        const throughput = this.calculateThroughputMetrics();
        const totalDuration = this.getTotalDurationSeconds();

        // 理想的なQPS（単一スレッドのレイテンシから計算）
        const idealQPS = this.threadCount > 0 && latency.average > 0
            ? (1000 / latency.average) * this.threadCount
            : 0;

        // 並列効率（実際のQPS / 理想的QPS）
        const parallelEfficiency = idealQPS > 0
            ? (throughput.qps / idealQPS) * 100
            : 0;

        return {
            threadCount: this.threadCount,
            actualQPS: throughput.qps,
            idealQPS: this.round(idealQPS, 2),
            parallelEfficiency: this.round(parallelEfficiency, 2),
            latency,
            throughput,
            totalDurationSeconds: this.round(totalDuration, 3)
        };
    }

    /**
     * 総実行時間を秒単位で取得
     * @returns {number} 総実行時間
     */
    getTotalDurationSeconds() {
        if (!this.startTime || !this.endTime) {
            return 0;
        }
        return (this.endTime - this.startTime) / 1000;
    }

    /**
     * 成功率を計算
     * @returns {number} 成功率（パーセント）
     */
    calculateSuccessRate() {
        const total = this.successCount + this.failureCount;
        if (total === 0) {
            return 0;
        }
        return (this.successCount / total) * 100;
    }

    /**
     * パーセンタイルを計算
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} percentile - パーセンタイル (0-100)
     * @returns {number} パーセンタイル値
     */
    calculatePercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) {
            return 0;
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
     * 数値を小数点以下で丸める
     * @param {number} value - 値
     * @param {number} decimals - 小数点以下の桁数
     * @returns {number} 丸められた値
     */
    round(value, decimals) {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * JSON形式に変換
     * @returns {Object} JSONオブジェクト
     */
    toJSON() {
        return {
            testName: this.testName,
            threadCount: this.threadCount,
            totalIterations: this.totalIterations,
            startTime: this.startTime,
            endTime: this.endTime,
            successCount: this.successCount,
            failureCount: this.failureCount,
            metrics: {
                parallel: this.calculateParallelPerformanceMetrics(),
                latency: this.calculateLatencyMetrics(),
                throughput: this.calculateThroughputMetrics()
            },
            errors: this.errors
        };
    }

    /**
     * サマリー情報を取得
     * @returns {Object} サマリー情報
     */
    getSummary() {
        const metrics = this.calculateParallelPerformanceMetrics();

        return {
            testName: this.testName,
            threadCount: this.threadCount,
            qps: metrics.actualQPS,
            averageLatency: metrics.latency.average,
            p95Latency: metrics.latency.p95,
            successRate: this.round(this.calculateSuccessRate(), 2),
            parallelEfficiency: metrics.parallelEfficiency,
            totalDuration: metrics.totalDurationSeconds
        };
    }
}

export default TestMetrics;
