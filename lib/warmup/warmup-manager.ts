/**
 * Warmup manager class.
 * Manages cache warming before benchmark execution.
 */

import {
    CacheEffectivenessAnalyzer,
    type WarmupIterationResult,
    type CacheEffectivenessResult
} from './cache-effectiveness-analyzer.js';

/** Configuration for warmup behavior */
export interface WarmupConfig {
    warmupIterations?: number;
    warmupPercentage?: number;
}

/** Options for warmup execution */
export interface WarmupExecuteOptions {
    silent?: boolean;
    throwOnError?: boolean;
}

/** Summary of a warmup run */
export interface WarmupSummary {
    count: number;
    successCount: number;
    failureCount: number;
    totalDuration: number | null;
    averageDuration: number | null;
    results: WarmupIterationResult[];
    cacheEffectiveness: CacheEffectivenessResult | null;
    timestamp: string;
}

export class WarmupManager {
    private config: WarmupConfig;
    private warmupResults: WarmupSummary[];

    constructor(config?: WarmupConfig) {
        this.config = config || {};
        this.warmupResults = [];
    }

    /**
     * Execute warmup runs.
     * @param executeFunction - Function to execute for each warmup iteration
     * @param targetIterations - Number of production iterations planned
     * @param options - Optional execution settings
     * @returns Warmup summary
     */
    async execute(
        executeFunction: () => Promise<void>,
        targetIterations: number,
        options: WarmupExecuteOptions = {}
    ): Promise<WarmupSummary> {
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

        const results: WarmupIterationResult[] = [];
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

                // Progress display
                if (!silent && (i + 1) % Math.max(1, Math.floor(warmupCount / 5)) === 0) {
                    console.log(`   進捗: ${i + 1}/${warmupCount} (${((i + 1) / warmupCount * 100).toFixed(0)}%)`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                if (!silent) {
                    console.warn(`   ⚠️ Warmup iteration ${i + 1} error (ignored): ${errorMessage}`);
                }

                results.push({
                    iteration: i + 1,
                    error: errorMessage,
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

        const warmupSummary: WarmupSummary = {
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
     * Calculate the number of warmup iterations.
     * @param targetIterations - Number of production iterations planned
     * @returns Number of warmup iterations
     */
    calculateWarmupCount(targetIterations: number): number {
        // Explicitly specified in config
        if (this.config.warmupIterations && this.config.warmupIterations > 0) {
            return this.config.warmupIterations;
        }

        // Percentage specified in config
        if (this.config.warmupPercentage) {
            const calculated = Math.ceil(targetIterations * (this.config.warmupPercentage / 100));
            return Math.max(1, calculated);
        }

        // Default: 20% of production iterations, min 2, max 10
        const calculated = Math.ceil(targetIterations * 0.2);
        return Math.max(2, Math.min(10, calculated));
    }

    /**
     * Get all warmup results.
     * @returns All warmup summaries
     */
    getSummary(): WarmupSummary[] {
        return this.warmupResults;
    }

    /**
     * Get the latest warmup result.
     * @returns Latest warmup summary, or null if none
     */
    getLatestResult(): WarmupSummary | null {
        return this.warmupResults.length > 0
            ? this.warmupResults[this.warmupResults.length - 1]
            : null;
    }

    /**
     * Reset warmup results.
     */
    reset(): void {
        this.warmupResults = [];
    }

    /**
     * Round a number to the specified decimal places.
     * @param value - Value to round
     * @param decimals - Number of decimal places
     * @returns Rounded value, or null if input is invalid
     */
    private round(value: number, decimals: number): number | null {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
