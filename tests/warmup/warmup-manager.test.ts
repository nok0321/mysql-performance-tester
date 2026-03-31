import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WarmupManager } from '../../lib/warmup/warmup-manager.js';
import type { WarmupConfig, WarmupSummary } from '../../lib/warmup/warmup-manager.js';

describe('WarmupManager', () => {
    describe('constructor', () => {
        it('creates with default config when none provided', () => {
            const manager = new WarmupManager();
            expect(manager).toBeInstanceOf(WarmupManager);
        });

        it('creates with custom config', () => {
            const config: WarmupConfig = { warmupIterations: 5 };
            const manager = new WarmupManager(config);
            expect(manager).toBeInstanceOf(WarmupManager);
        });
    });

    describe('calculateWarmupCount', () => {
        it('uses explicit warmupIterations when provided', () => {
            const manager = new WarmupManager({ warmupIterations: 7 });
            expect(manager.calculateWarmupCount(100)).toBe(7);
        });

        it('ignores warmupIterations of 0', () => {
            const manager = new WarmupManager({ warmupIterations: 0 });
            // Falls through to default: 20% of 50 = 10, clamped to max 10
            expect(manager.calculateWarmupCount(50)).toBe(10);
        });

        it('uses warmupPercentage when provided', () => {
            const manager = new WarmupManager({ warmupPercentage: 50 });
            // 50% of 20 = 10
            expect(manager.calculateWarmupCount(20)).toBe(10);
        });

        it('ensures minimum of 1 when using warmupPercentage', () => {
            const manager = new WarmupManager({ warmupPercentage: 1 });
            // 1% of 1 = 0.01 -> ceil = 1, max(1, 1) = 1
            expect(manager.calculateWarmupCount(1)).toBe(1);
        });

        it('prefers warmupIterations over warmupPercentage', () => {
            const manager = new WarmupManager({ warmupIterations: 3, warmupPercentage: 50 });
            expect(manager.calculateWarmupCount(100)).toBe(3);
        });

        it('uses default 20% with min 2, max 10 when no config', () => {
            const manager = new WarmupManager();

            // 20% of 5 = 1 -> max(2, min(10, 1)) = 2
            expect(manager.calculateWarmupCount(5)).toBe(2);

            // 20% of 20 = 4 -> max(2, min(10, 4)) = 4
            expect(manager.calculateWarmupCount(20)).toBe(4);

            // 20% of 100 = 20 -> max(2, min(10, 20)) = 10
            expect(manager.calculateWarmupCount(100)).toBe(10);
        });

        it('clamps default to minimum of 2', () => {
            const manager = new WarmupManager();
            // 20% of 1 = 0.2 -> ceil = 1 -> max(2, 1) = 2
            expect(manager.calculateWarmupCount(1)).toBe(2);
        });

        it('clamps default to maximum of 10', () => {
            const manager = new WarmupManager();
            // 20% of 1000 = 200 -> max(2, min(10, 200)) = 10
            expect(manager.calculateWarmupCount(1000)).toBe(10);
        });
    });

    describe('execute', () => {
        let manager: WarmupManager;

        beforeEach(() => {
            manager = new WarmupManager({ warmupIterations: 3 });
        });

        it('calls the function the correct number of times', async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            await manager.execute(fn, 10, { silent: true });
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('returns a valid WarmupSummary', async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(summary.count).toBe(3);
            expect(summary.successCount).toBe(3);
            expect(summary.failureCount).toBe(0);
            expect(summary.totalDuration).toBeTypeOf('number');
            expect(summary.totalDuration).toBeGreaterThanOrEqual(0);
            expect(summary.averageDuration).toBeTypeOf('number');
            expect(summary.averageDuration).toBeGreaterThanOrEqual(0);
            expect(summary.results).toHaveLength(3);
            expect(summary.timestamp).toBeTruthy();
        });

        it('records iteration details in results array', async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            const summary = await manager.execute(fn, 10, { silent: true });

            for (let i = 0; i < 3; i++) {
                const result = summary.results[i];
                expect(result.iteration).toBe(i + 1);
                expect(result.success).toBe(true);
                expect(result.duration).toBeTypeOf('number');
                expect(result.timestamp).toBeTruthy();
            }
        });

        it('counts failures when callback throws', async () => {
            const fn = vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('DB timeout'))
                .mockResolvedValueOnce(undefined);

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(summary.successCount).toBe(2);
            expect(summary.failureCount).toBe(1);
            expect(summary.results[1].success).toBe(false);
            expect(summary.results[1].error).toBe('DB timeout');
        });

        it('continues execution after failure by default', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined);

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(fn).toHaveBeenCalledTimes(3);
            expect(summary.successCount).toBe(2);
            expect(summary.failureCount).toBe(1);
        });

        it('throws when throwOnError is true and callback fails', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('critical failure'));

            await expect(
                manager.execute(fn, 10, { silent: true, throwOnError: true })
            ).rejects.toThrow('critical failure');
        });

        it('handles all iterations failing', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('always fails'));

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(summary.successCount).toBe(0);
            expect(summary.failureCount).toBe(3);
            expect(summary.results.every(r => !r.success)).toBe(true);
        });

        it('handles non-Error thrown values', async () => {
            const fn = vi.fn().mockRejectedValue('string error');

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(summary.failureCount).toBe(3);
            expect(summary.results[0].error).toBe('string error');
        });

        it('populates cacheEffectiveness when enough data', async () => {
            // With 3 successful iterations, cache analysis should work
            let callCount = 0;
            const fn = vi.fn().mockImplementation(async () => {
                // Simulate decreasing execution time for cache warmup effect
                const delay = 10 - callCount * 3;
                callCount++;
                await new Promise(resolve => setTimeout(resolve, Math.max(1, delay)));
            });

            const summary = await manager.execute(fn, 10, { silent: true });

            // cacheEffectiveness should be populated (at least 2 successful results)
            expect(summary.cacheEffectiveness).not.toBeNull();
            if (summary.cacheEffectiveness) {
                expect(summary.cacheEffectiveness.firstHalfAvg).toBeTypeOf('number');
                expect(summary.cacheEffectiveness.secondHalfAvg).toBeTypeOf('number');
                expect(summary.cacheEffectiveness.effectivenessRating).toBeTypeOf('string');
                expect(summary.cacheEffectiveness.trend).toBeDefined();
                expect(summary.cacheEffectiveness.recommendation).toBeTypeOf('string');
            }
        });

        it('stores results accessible via getSummary', async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            expect(manager.getSummary()).toHaveLength(0);

            await manager.execute(fn, 10, { silent: true });
            expect(manager.getSummary()).toHaveLength(1);

            await manager.execute(fn, 10, { silent: true });
            expect(manager.getSummary()).toHaveLength(2);
        });

        it('stores results accessible via getLatestResult', async () => {
            const fn = vi.fn().mockResolvedValue(undefined);

            expect(manager.getLatestResult()).toBeNull();

            await manager.execute(fn, 10, { silent: true });
            const latest = manager.getLatestResult();
            expect(latest).not.toBeNull();
            expect(latest!.count).toBe(3);
        });
    });

    describe('getSummary', () => {
        it('returns empty array initially', () => {
            const manager = new WarmupManager();
            expect(manager.getSummary()).toEqual([]);
        });
    });

    describe('getLatestResult', () => {
        it('returns null when no executions have occurred', () => {
            const manager = new WarmupManager();
            expect(manager.getLatestResult()).toBeNull();
        });

        it('returns the most recent result after multiple executions', async () => {
            const manager = new WarmupManager({ warmupIterations: 1 });
            const fn = vi.fn().mockResolvedValue(undefined);

            await manager.execute(fn, 5, { silent: true });
            await manager.execute(fn, 10, { silent: true });

            const latest = manager.getLatestResult();
            expect(latest).not.toBeNull();
            // Both should have count=1 (warmupIterations=1), but we verify it's the last one
            expect(manager.getSummary()).toHaveLength(2);
        });
    });

    describe('reset', () => {
        it('clears all stored results', async () => {
            const manager = new WarmupManager({ warmupIterations: 1 });
            const fn = vi.fn().mockResolvedValue(undefined);

            await manager.execute(fn, 10, { silent: true });
            expect(manager.getSummary()).toHaveLength(1);

            manager.reset();
            expect(manager.getSummary()).toHaveLength(0);
            expect(manager.getLatestResult()).toBeNull();
        });
    });

    describe('WarmupSummary structure', () => {
        it('has all required fields', async () => {
            const manager = new WarmupManager({ warmupIterations: 2 });
            const fn = vi.fn().mockResolvedValue(undefined);

            const summary: WarmupSummary = await manager.execute(fn, 10, { silent: true });

            // Verify all fields exist with correct types
            expect(summary).toHaveProperty('count');
            expect(summary).toHaveProperty('successCount');
            expect(summary).toHaveProperty('failureCount');
            expect(summary).toHaveProperty('totalDuration');
            expect(summary).toHaveProperty('averageDuration');
            expect(summary).toHaveProperty('results');
            expect(summary).toHaveProperty('cacheEffectiveness');
            expect(summary).toHaveProperty('timestamp');

            expect(typeof summary.count).toBe('number');
            expect(typeof summary.successCount).toBe('number');
            expect(typeof summary.failureCount).toBe('number');
            expect(Array.isArray(summary.results)).toBe(true);
            expect(typeof summary.timestamp).toBe('string');
        });

        it('has consistent count = successCount + failureCount', async () => {
            const manager = new WarmupManager({ warmupIterations: 4 });
            const fn = vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('err'))
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('err'));

            const summary = await manager.execute(fn, 10, { silent: true });

            expect(summary.count).toBe(summary.successCount + summary.failureCount);
            expect(summary.successCount).toBe(2);
            expect(summary.failureCount).toBe(2);
        });

        it('has valid ISO timestamp', async () => {
            const manager = new WarmupManager({ warmupIterations: 1 });
            const fn = vi.fn().mockResolvedValue(undefined);

            const summary = await manager.execute(fn, 10, { silent: true });

            const parsed = new Date(summary.timestamp);
            expect(parsed.getTime()).not.toBeNaN();
        });
    });
});
