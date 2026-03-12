/**
 * ウォームアップマネージャークラス
 * ベンチマーク実行前のキャッシュウォーミングを管理
 */

import { CacheEffectivenessAnalyzer } from './cache-effectiveness-analyzer.js';

export class WarmupManager {
    constructor(config) {
        this.config = config || {};
        this.warmupResults = [];
    }

    /**
     * ウォームアップ実行
     * @param {Function} executeFunction - 実行する関数
     * @param {number} targetIterations - 本番実行回数
     * @param {Object} options - オプション設定
     * @returns {Object} ウォームアップ結果
     */
    async execute(executeFunction, targetIterations, options = {}) {
        const {
            silent = false,
            throwOnError = false
        } = options;

        const warmupCount = this.calculateWarmupCount(targetIterations);

        if (!silent) {
            console.log(`\n🔥 ウォームアップ実行`);
            console.log(`   対象: ${targetIterations}回の本番実行`);
            console.log(`   ウォームアップ: ${warmupCount}回実行`);
            console.log(`   目的: キャッシュウォーミング、コネクション確立`);
        }

        const results = [];
        const startTime = performance.now();

        for (let i = 0; i < warmupCount; i++) {
            try {
                const iterationStart = performance.now();
                await executeFunction();
                const duration = performance.now() - iterationStart;

                results.push({
                    iteration: i + 1,
                    duration,
                    success: true,
                    timestamp: new Date().toISOString()
                });

                // プログレス表示
                if (!silent && (i + 1) % Math.max(1, Math.floor(warmupCount / 5)) === 0) {
                    console.log(`   進捗: ${i + 1}/${warmupCount} (${((i + 1) / warmupCount * 100).toFixed(0)}%)`);
                }
            } catch (error) {
                if (!silent) {
                    console.warn(`   ⚠️ ウォームアップ ${i + 1}回目エラー (無視): ${error.message}`);
                }

                results.push({
                    iteration: i + 1,
                    error: error.message,
                    success: false,
                    timestamp: new Date().toISOString()
                });

                if (throwOnError) {
                    throw error;
                }
            }
        }

        const totalDuration = performance.now() - startTime;
        const successCount = results.filter(r => r.success).length;

        if (!silent) {
            console.log(`✓ ウォームアップ完了`);
            console.log(`   成功: ${successCount}/${warmupCount}`);
            console.log(`   所要時間: ${totalDuration.toFixed(2)}ms`);
        }

        const warmupSummary = {
            count: warmupCount,
            successCount,
            failureCount: warmupCount - successCount,
            totalDuration: this.round(totalDuration, 2),
            averageDuration: this.round(totalDuration / warmupCount, 2),
            results,
            cacheEffectiveness: CacheEffectivenessAnalyzer.analyze(results),
            timestamp: new Date().toISOString()
        };

        this.warmupResults.push(warmupSummary);

        return warmupSummary;
    }

    /**
     * ウォームアップ回数の計算
     * @param {number} targetIterations - 本番実行回数
     * @returns {number} ウォームアップ回数
     */
    calculateWarmupCount(targetIterations) {
        // 設定で明示的に指定されている場合
        if (this.config.warmupIterations && this.config.warmupIterations > 0) {
            return this.config.warmupIterations;
        }

        // 設定で割合が指定されている場合
        if (this.config.warmupPercentage) {
            const calculated = Math.ceil(targetIterations * (this.config.warmupPercentage / 100));
            return Math.max(1, calculated);
        }

        // デフォルト: 本番実行の20%、最小2回、最大10回
        const calculated = Math.ceil(targetIterations * 0.2);
        return Math.max(2, Math.min(10, calculated));
    }

    /**
     * ウォームアップサマリーの取得
     * @returns {Array} 全ウォームアップ結果
     */
    getSummary() {
        return this.warmupResults;
    }

    /**
     * 最新のウォームアップ結果を取得
     * @returns {Object|null} 最新の結果
     */
    getLatestResult() {
        return this.warmupResults.length > 0
            ? this.warmupResults[this.warmupResults.length - 1]
            : null;
    }

    /**
     * ウォームアップ結果のリセット
     */
    reset() {
        this.warmupResults = [];
    }

    /**
     * 数値の丸め
     * @param {number} value - 丸める値
     * @param {number} decimals - 小数点以下の桁数
     * @returns {number} 丸められた値
     */
    round(value, decimals) {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
