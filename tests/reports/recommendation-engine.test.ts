import { describe, it, expect } from 'vitest';
import { RecommendationEngine } from '../../lib/reports/recommendation-engine.js';
import type { InternalReportData } from '../../lib/reports/recommendation-engine.js';

/**
 * Helper to create minimal report data for the RecommendationEngine
 */
function createReportData(overrides: Record<string, unknown> = {}): InternalReportData {
    return {
        summary: {
            overallMetrics: {
                averageP95: null as string | null,
                maxQPS: null as string | null,
            },
            ...(overrides.summary as Record<string, unknown> || {}),
        },
        details: (overrides.details || []) as InternalReportData['details'],
        recommendations: [],
    };
}

describe('RecommendationEngine', () => {
    describe('generateRecommendations', () => {
        it('returns an empty array when report data has no issues', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: '10', maxQPS: '5000' },
                },
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.generateRecommendations();
            expect(recs).toEqual([]);
        });

        it('aggregates recommendations from all analyzers', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: '200', maxQPS: '500' },
                },
                details: [
                    {
                        bufferPool: { hitRatio: 80 },
                        warmupEffectiveness: { improvementPercentage: 40 },
                        performanceSchema: { fullTableScans: [{}] },
                        statistics: { spread: { cv: 60 } },
                    },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.generateRecommendations();

            // Should have recommendations from latency, throughput, bufferPool, warmup, indexing, consistency
            expect(recs.length).toBeGreaterThanOrEqual(6);
        });
    });

    describe('analyzeLatency', () => {
        it('returns high priority when averageP95 > 100', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: '150', maxQPS: null },
                },
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeLatency();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('performance');
            expect(recs[0].actions.length).toBeGreaterThan(0);
        });

        it('returns medium priority when averageP95 between 50 and 100', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: '75', maxQPS: null },
                },
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeLatency();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
        });

        it('returns no recommendations when averageP95 <= 50', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: '25', maxQPS: null },
                },
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeLatency()).toEqual([]);
        });

        it('returns no recommendations when averageP95 is null', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: null, maxQPS: null },
                },
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeLatency()).toEqual([]);
        });
    });

    describe('analyzeThroughput', () => {
        it('returns high priority when maxQPS < 1000', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: null, maxQPS: '500' },
                },
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeThroughput();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('performance');
        });

        it('returns medium priority when maxQPS between 1000 and 3000', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: null, maxQPS: '2000' },
                },
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeThroughput();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
        });

        it('returns no recommendations when maxQPS >= 3000', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: null, maxQPS: '5000' },
                },
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeThroughput()).toEqual([]);
        });

        it('returns no recommendations when maxQPS is null', () => {
            const data = createReportData({
                summary: {
                    overallMetrics: { averageP95: null, maxQPS: null },
                },
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeThroughput()).toEqual([]);
        });
    });

    describe('analyzeBufferPool', () => {
        it('returns high priority when average hit ratio < 90', () => {
            const data = createReportData({
                details: [
                    { bufferPool: { hitRatio: 80 } },
                    { bufferPool: { hitRatio: 85 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeBufferPool();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('configuration');
        });

        it('returns medium priority when average hit ratio between 90 and 95', () => {
            const data = createReportData({
                details: [
                    { bufferPool: { hitRatio: 92 } },
                    { bufferPool: { hitRatio: 93 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeBufferPool();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
        });

        it('returns no recommendations when all hit ratios >= 95', () => {
            const data = createReportData({
                details: [
                    { bufferPool: { hitRatio: 98 } },
                    { bufferPool: { hitRatio: 99 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeBufferPool()).toEqual([]);
        });

        it('returns no recommendations when no bufferPool data', () => {
            const data = createReportData({
                details: [{ testName: 'test1' }],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeBufferPool()).toEqual([]);
        });
    });

    describe('analyzeWarmup', () => {
        it('returns high priority when average improvement > 30%', () => {
            const data = createReportData({
                details: [
                    { warmupEffectiveness: { improvementPercentage: 40 } },
                    { warmupEffectiveness: { improvementPercentage: 50 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeWarmup();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('practice');
        });

        it('returns medium priority when average improvement between 20% and 30%', () => {
            const data = createReportData({
                details: [
                    { warmupEffectiveness: { improvementPercentage: 25 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeWarmup();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
        });

        it('returns no recommendations when improvement <= 20%', () => {
            const data = createReportData({
                details: [
                    { warmupEffectiveness: { improvementPercentage: 10 } },
                ],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeWarmup()).toEqual([]);
        });
    });

    describe('analyzeIndexing', () => {
        it('returns high priority when full table scans detected', () => {
            const data = createReportData({
                details: [
                    { performanceSchema: { fullTableScans: [{ table: 'users' }] } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeIndexing();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('optimization');
        });

        it('returns high priority when query plan has issues', () => {
            const data = createReportData({
                details: [
                    { queryPlan: { hasIssues: true } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeIndexing();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
        });

        it('returns no recommendations when no indexing issues', () => {
            const data = createReportData({
                details: [
                    { performanceSchema: { fullTableScans: [] }, queryPlan: { hasIssues: false } },
                ],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeIndexing()).toEqual([]);
        });
    });

    describe('analyzeConsistency', () => {
        it('returns high priority when average CV > 50%', () => {
            const data = createReportData({
                details: [
                    { statistics: { spread: { cv: 60 } } },
                    { statistics: { spread: { cv: 70 } } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeConsistency();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('high');
            expect(recs[0].category).toBe('stability');
        });

        it('returns medium priority when average CV between 30% and 50%', () => {
            const data = createReportData({
                details: [
                    { statistics: { spread: { cv: 35 } } },
                    { statistics: { spread: { cv: 40 } } },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeConsistency();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
        });

        it('returns no recommendations when CV <= 30%', () => {
            const data = createReportData({
                details: [
                    { statistics: { spread: { cv: 15 } } },
                ],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeConsistency()).toEqual([]);
        });
    });

    describe('analyzeParallelExecution', () => {
        it('recommends the best parallel strategy by QPS', () => {
            const data = createReportData({
                details: [
                    {
                        isParallelTest: true,
                        parallelMetrics: {
                            strategy: 'round-robin',
                            throughput: { qps: 1000 },
                        },
                    },
                    {
                        isParallelTest: true,
                        parallelMetrics: {
                            strategy: 'random',
                            throughput: { qps: 2000 },
                        },
                    },
                ],
            });
            const engine = new RecommendationEngine(data);
            const recs = engine.analyzeParallelExecution();

            expect(recs).toHaveLength(1);
            expect(recs[0].priority).toBe('medium');
            expect(recs[0].category).toBe('optimization');
            expect(recs[0].description).toContain('random');
        });

        it('returns no recommendations when there are no parallel tests', () => {
            const data = createReportData({
                details: [{ isParallelTest: false }],
            });
            const engine = new RecommendationEngine(data);
            expect(engine.analyzeParallelExecution()).toEqual([]);
        });
    });

    describe('sortRecommendationsByPriority', () => {
        it('sorts high before medium before low', () => {
            const engine = new RecommendationEngine(createReportData());
            const recs = [
                { priority: 'low', category: 'c', title: 'low', description: '', actions: [] },
                { priority: 'high', category: 'c', title: 'high', description: '', actions: [] },
                { priority: 'medium', category: 'c', title: 'medium', description: '', actions: [] },
            ];
            const sorted = engine.sortRecommendationsByPriority(recs);

            expect(sorted[0].priority).toBe('high');
            expect(sorted[1].priority).toBe('medium');
            expect(sorted[2].priority).toBe('low');
        });

        it('returns empty array for empty input', () => {
            const engine = new RecommendationEngine(createReportData());
            expect(engine.sortRecommendationsByPriority([])).toEqual([]);
        });
    });
});
