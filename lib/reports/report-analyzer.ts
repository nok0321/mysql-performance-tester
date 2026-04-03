/**
 * Report Analyzer
 * Analyzes test results and evaluates metrics
 */

interface TestCount {
    total: number;
    successful: number;
    failed: number;
}

interface OverallMetrics {
    totalQueries: number;
    averageP95: string | null;
    maxQPS: string | null;
    avgQPS: string | null;
}

export interface ReportSummary {
    testCount: TestCount;
    overallMetrics: OverallMetrics;
    performanceGrade: string;
}

interface PercentileValues {
    p50: number;
    p95: number;
    p99: number;
    [key: string]: number;
}

interface BasicValues {
    mean: number;
    min: number;
    max: number;
    median?: number;
}

interface SpreadValues {
    cv: number;
    stdDev: number;
    iqr?: number;
    range?: number;
}

interface OutlierValues {
    count: number;
    percentage: number;
}

interface StatisticsData {
    count: { total: number; included: number; outliers?: number };
    basic: BasicValues;
    spread: SpreadValues;
    percentiles: PercentileValues;
    outliers?: OutlierValues | null;
}

interface CacheEffectiveness {
    improvementPercentage: number;
    [key: string]: unknown;
}

interface WarmupResult {
    cacheEffectiveness?: CacheEffectiveness;
    [key: string]: unknown;
}

interface BufferPoolMetrics {
    hitRatio: number;
    pagesTotal: number;
    pagesFree: number;
    pagesData: number;
    [key: string]: unknown;
}

interface BufferPoolAnalysis {
    metrics: BufferPoolMetrics;
    [key: string]: unknown;
}

interface TopQueryItem {
    avgLatency: number;
    executionCount: number;
    rowsExamined: number;
    [key: string]: unknown;
}

interface TableScanItem {
    [key: string]: unknown;
}

interface PerformanceSchemaData {
    connections?: Record<string, number>;
    topQueries?: TopQueryItem[] | null;
    tableScans?: TableScanItem[] | null;
    [key: string]: unknown;
}

interface ExplainData {
    analyze?: { tree: string };
    data?: {
        query_block?: {
            table?: {
                access_type?: string;
                rows_examined_per_scan?: number;
            };
        };
    };
    [key: string]: unknown;
}

interface ParallelResultsData {
    strategy: string;
    metrics: {
        duration: Record<string, unknown>;
        queries: Record<string, unknown>;
        throughput: {
            qps: number;
            effectiveQps?: number;
            [key: string]: unknown;
        };
        latency: {
            percentiles: PercentileValues;
            basic: BasicValues;
            spread: SpreadValues;
            [key: string]: unknown;
        };
        perFile?: Record<string, unknown>;
    };
    [key: string]: unknown;
}

export interface TestResultInput {
    testName: string;
    query?: string;
    timestamp?: string;
    rawDurations?: number[];
    statistics?: StatisticsData;
    parallelResults?: ParallelResultsData;
    warmupResult?: WarmupResult;
    bufferPoolAnalysis?: BufferPoolAnalysis;
    performanceSchemaMetrics?: PerformanceSchemaData;
    explainAnalyze?: ExplainData;
    [key: string]: unknown;
}

export interface TestAnalysis {
    testName: string;
    query?: string;
    timestamp?: string;
    isParallelTest?: boolean;
    parallelMetrics?: Record<string, unknown>;
    statistics?: Record<string, unknown>;
    warmupEffectiveness?: Record<string, unknown>;
    bufferPool?: Record<string, unknown>;
    performanceSchema?: Record<string, unknown>;
    queryPlan?: Record<string, unknown>;
}

/**
 * Report analyzer class
 */
export class ReportAnalyzer {
    testResults: TestResultInput[];
    config: Record<string, unknown>;

    constructor(testResults: TestResultInput[], config: Record<string, unknown>) {
        this.testResults = testResults;
        this.config = config;
    }

    /**
     * Generate summary of all test results
     */
    generateSummary(): ReportSummary {
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(t =>
            (t.statistics && t.statistics.count.included > 0) ||
            (t.parallelResults && t.parallelResults.metrics)
        ).length;

        // Aggregate statistics across all tests
        const allDurations: number[] = [];
        const allP95s: number[] = [];
        const allQPS: number[] = [];

        this.testResults.forEach(test => {
            if (test.rawDurations && test.rawDurations.length > 0) {
                allDurations.push(...test.rawDurations);
            }
            if (test.statistics && test.statistics.percentiles) {
                allP95s.push(test.statistics.percentiles.p95);
            }
            // Get QPS from parallel test results
            if (test.parallelResults && test.parallelResults.metrics) {
                if (test.parallelResults.metrics.throughput) {
                    allQPS.push(test.parallelResults.metrics.throughput.qps);
                }
                // Also aggregate P95 from parallel tests
                if (test.parallelResults.metrics.latency && test.parallelResults.metrics.latency.percentiles) {
                    allP95s.push(test.parallelResults.metrics.latency.percentiles.p95);
                }
            }
        });

        return {
            testCount: {
                total: totalTests,
                successful: successfulTests,
                failed: totalTests - successfulTests
            },
            overallMetrics: {
                totalQueries: allDurations.length,
                averageP95: allP95s.length > 0
                    ? (allP95s.reduce((a, b) => a + b, 0) / allP95s.length).toFixed(3)
                    : null,
                maxQPS: allQPS.length > 0
                    ? Math.max(...allQPS).toFixed(2)
                    : null,
                avgQPS: allQPS.length > 0
                    ? (allQPS.reduce((a, b) => a + b, 0) / allQPS.length).toFixed(2)
                    : null
            },
            performanceGrade: this.calculatePerformanceGrade(allP95s)
        };
    }

    /**
     * Detailed analysis of individual test result
     */
    analyzeTestResult(testResult: TestResultInput): TestAnalysis {
        const analysis: TestAnalysis = {
            testName: testResult.testName,
            query: testResult.query,
            timestamp: testResult.timestamp
        };

        // Parallel test results
        if (testResult.parallelResults) {
            analysis.isParallelTest = true;
            analysis.parallelMetrics = this.analyzeParallelResults(testResult.parallelResults);
        }

        // Statistical analysis
        if (testResult.statistics) {
            analysis.statistics = {
                ...testResult.statistics,
                grade: this.gradeLatency(testResult.statistics.percentiles.p95),
                interpretation: this.interpretStatistics(testResult.statistics)
            };
        }

        // Warmup effect analysis
        if (testResult.warmupResult && testResult.warmupResult.cacheEffectiveness) {
            analysis.warmupEffectiveness = {
                ...testResult.warmupResult.cacheEffectiveness,
                interpretation: this.interpretWarmupEffectiveness(
                    testResult.warmupResult.cacheEffectiveness
                )
            };
        }

        // Buffer Pool analysis
        if (testResult.bufferPoolAnalysis) {
            analysis.bufferPool = {
                ...testResult.bufferPoolAnalysis.metrics,
                grade: this.gradeBufferPoolHitRatio(
                    testResult.bufferPoolAnalysis.metrics.hitRatio
                ),
                interpretation: this.interpretBufferPool(
                    testResult.bufferPoolAnalysis.metrics
                )
            };
        }

        // Performance Schema analysis
        if (testResult.performanceSchemaMetrics) {
            analysis.performanceSchema = this.analyzePerformanceSchema(
                testResult.performanceSchemaMetrics
            );
        }

        // EXPLAIN analysis
        if (testResult.explainAnalyze) {
            analysis.queryPlan = this.analyzeQueryPlan(testResult.explainAnalyze);
        }

        return analysis;
    }

    /**
     * Analyze parallel test results
     */
    analyzeParallelResults(parallelResults: ParallelResultsData): Record<string, unknown> {
        const metrics = parallelResults.metrics;

        return {
            strategy: parallelResults.strategy,
            duration: metrics.duration,
            queries: metrics.queries,
            throughput: {
                ...metrics.throughput,
                grade: this.gradeThroughput(metrics.throughput.qps),
                interpretation: this.interpretThroughput(metrics.throughput)
            },
            latency: {
                ...metrics.latency,
                grade: this.gradeLatency(metrics.latency.percentiles.p95),
                interpretation: this.interpretParallelLatency(metrics.latency)
            },
            perFile: metrics.perFile || {}
        };
    }

    /**
     * Interpret statistics
     */
    interpretStatistics(stats: StatisticsData): string[] {
        const interpretation: string[] = [];

        // Evaluate coefficient of variation
        if (stats.spread.cv < 10) {
            interpretation.push('実行時間が非常に安定しています');
        } else if (stats.spread.cv < 20) {
            interpretation.push('実行時間は比較的安定しています');
        } else if (stats.spread.cv < 30) {
            interpretation.push('実行時間にやや変動があります');
        } else {
            interpretation.push('実行時間が不安定です。システム負荷やネットワークを確認してください');
        }

        // Compare P95 and P50
        const p95p50Ratio = stats.percentiles.p95 / stats.percentiles.p50;
        if (p95p50Ratio > 2) {
            interpretation.push('P95がP50の2倍以上です。一部のクエリで顕著な遅延が発生しています');
        }

        // Evaluate outliers
        if (stats.outliers && stats.outliers.count > 0) {
            const outlierPct = stats.outliers.percentage;
            if (outlierPct > 10) {
                interpretation.push(`外れ値が${outlierPct}%と多すぎます。システムに問題がある可能性があります`);
            } else if (outlierPct > 5) {
                interpretation.push(`外れ値が${outlierPct}%検出されました`);
            } else {
                interpretation.push(`外れ値は${outlierPct}%と正常範囲です`);
            }
        }

        return interpretation;
    }

    /**
     * Interpret parallel test latency
     */
    interpretParallelLatency(latency: { percentiles: PercentileValues; spread: SpreadValues }): string[] {
        const interpretation: string[] = [];

        // Evaluate CV
        if (latency.spread.cv < 30) {
            interpretation.push('レイテンシが安定しています');
        } else if (latency.spread.cv < 50) {
            interpretation.push('レイテンシにやや変動があります');
        } else {
            interpretation.push('レイテンシが不安定です');
        }

        // Compare P95 and P50
        const p95p50Ratio = latency.percentiles.p95 / latency.percentiles.p50;
        if (p95p50Ratio > 3) {
            interpretation.push('P95がP50の3倍以上です。一部のリクエストで顕著な遅延が発生しています');
        } else if (p95p50Ratio > 2) {
            interpretation.push('P95とP50に差があります');
        }

        // Evaluate P99
        if (latency.percentiles.p99 > latency.percentiles.p95 * 2) {
            interpretation.push('P99が非常に高いです。外れ値的な遅延が発生しています');
        }

        return interpretation;
    }

    /**
     * Interpret throughput
     */
    interpretThroughput(throughput: { qps: number; effectiveQps?: number }): string[] {
        const interpretation: string[] = [];
        const qps = throughput.qps;

        if (qps >= 5000) {
            interpretation.push('非常に高いスループットを達成しています');
        } else if (qps >= 3000) {
            interpretation.push('良好なスループットです');
        } else if (qps >= 1000) {
            interpretation.push('中程度のスループットです。最適化の余地があります');
        } else {
            interpretation.push('スループットが低いです。最適化が必要です');
        }

        const effectiveQps = throughput.effectiveQps;
        if (effectiveQps && effectiveQps > qps * 1.2) {
            interpretation.push('実効スループットが高く、並列処理が効果的です');
        }

        return interpretation;
    }

    /**
     * Interpret warmup effectiveness
     */
    interpretWarmupEffectiveness(effectiveness: CacheEffectiveness): string[] {
        const interpretation: string[] = [];
        const improvement = effectiveness.improvementPercentage;

        if (improvement > 30) {
            interpretation.push('キャッシュ効果が非常に高く、ウォームアップが効果的です');
            interpretation.push('本番環境でも事前ウォーミングを推奨');
        } else if (improvement > 10) {
            interpretation.push('適度なキャッシュ効果があります');
        } else if (improvement > 0) {
            interpretation.push('キャッシュ効果が限定的です');
            interpretation.push('Buffer Pool設定やクエリの最適化を検討してください');
        } else {
            interpretation.push('キャッシュ効果が見られません');
            interpretation.push('データベースのキャッシュ設定を確認してください');
        }

        return interpretation;
    }

    /**
     * Interpret Buffer Pool
     */
    interpretBufferPool(metrics: BufferPoolMetrics): string[] {
        const interpretation: string[] = [];
        const hitRatio = metrics.hitRatio;

        if (hitRatio >= 99) {
            interpretation.push('Buffer Poolヒット率が非常に高く、最適です');
        } else if (hitRatio >= 95) {
            interpretation.push('Buffer Poolヒット率は良好です');
        } else if (hitRatio >= 90) {
            interpretation.push('Buffer Poolヒット率がやや低めです');
            interpretation.push('innodb_buffer_pool_sizeの増加を検討してください');
        } else {
            interpretation.push('Buffer Poolヒット率が低すぎます');
            interpretation.push('至急、Buffer Pool設定を見直してください');
        }

        const freePercentage = (metrics.pagesFree / metrics.pagesTotal) * 100;
        if (freePercentage < 5) {
            interpretation.push('Buffer Poolの空きページが少なくなっています');
        }

        return interpretation;
    }

    /**
     * Analyze Performance Schema
     */
    analyzePerformanceSchema(metrics: PerformanceSchemaData): Record<string, unknown> {
        const analysis: Record<string, unknown> = {};

        // Connection statistics
        if (metrics.connections) {
            const conn = metrics.connections;
            const connAnalysis: Record<string, unknown> = {
                ...conn,
                interpretation: [] as string[]
            };

            if (conn.Threads_running > conn.Threads_connected * 0.5) {
                (connAnalysis.interpretation as string[]).push(
                    '実行中のスレッドが多すぎます。システムが過負荷の可能性があります'
                );
            }

            if (conn.Aborted_connects > 0) {
                (connAnalysis.interpretation as string[]).push(
                    `接続中断が${conn.Aborted_connects}件発生しています`
                );
            }
            analysis.connections = connAnalysis;
        }

        // Top queries
        if (metrics.topQueries && metrics.topQueries.length > 0) {
            analysis.slowQueries = metrics.topQueries.slice(0, 5).map(q => ({
                ...q,
                needsOptimization: q.avgLatency > 100 || q.rowsExamined > 1000
            }));
        }

        // Table scans
        if (metrics.tableScans && metrics.tableScans.length > 0) {
            const fullTableScans: Record<string, unknown> = {
                items: metrics.tableScans,
                interpretation: [
                    'フルテーブルスキャンが検出されました',
                    '適切なインデックスの追加を検討してください'
                ]
            };
            analysis.fullTableScans = fullTableScans;
        }

        return analysis;
    }

    /**
     * Analyze query plan
     */
    analyzeQueryPlan(explainData: ExplainData): Record<string, unknown> {
        const analysis: {
            hasIssues: boolean;
            issues: string[];
            recommendations: string[];
        } = {
            hasIssues: false,
            issues: [],
            recommendations: []
        };

        // EXPLAIN ANALYZE data
        if (explainData.analyze && explainData.analyze.tree) {
            const tree = explainData.analyze.tree;

            if (tree.includes('Full scan')) {
                analysis.hasIssues = true;
                analysis.issues.push('フルテーブルスキャンが発生');
                analysis.recommendations.push('インデックスの追加を検討');
            }

            if (tree.includes('Using temporary')) {
                analysis.hasIssues = true;
                analysis.issues.push('一時テーブルを使用');
                analysis.recommendations.push('GROUP BYやORDER BYの最適化を検討');
            }

            if (tree.includes('Using filesort')) {
                analysis.hasIssues = true;
                analysis.issues.push('ファイルソートを使用');
                analysis.recommendations.push('適切なインデックスでソートを回避');
            }
        }

        // Standard EXPLAIN data analysis
        if (explainData.data && explainData.data.query_block) {
            const queryBlock = explainData.data.query_block;

            if (queryBlock.table) {
                const table = queryBlock.table;

                if (table.access_type === 'ALL') {
                    analysis.hasIssues = true;
                    analysis.issues.push('アクセスタイプがALL（フルスキャン）');
                }

                if (table.rows_examined_per_scan && table.rows_examined_per_scan > 10000) {
                    analysis.hasIssues = true;
                    analysis.issues.push(`スキャン行数が多い（${table.rows_examined_per_scan}行）`);
                }
            }
        }

        return analysis;
    }

    /**
     * Calculate performance grade
     */
    calculatePerformanceGrade(p95Values: number[]): string {
        if (p95Values.length === 0) return 'N/A';

        const avgP95 = p95Values.reduce((a, b) => a + b, 0) / p95Values.length;

        if (avgP95 < 10) return 'A+ (Excellent)';
        if (avgP95 < 50) return 'A (Very Good)';
        if (avgP95 < 100) return 'B (Good)';
        if (avgP95 < 200) return 'C (Fair)';
        if (avgP95 < 500) return 'D (Poor)';
        return 'F (Critical)';
    }

    /**
     * Grade latency
     */
    gradeLatency(p95: number): string {
        if (p95 < 10) return 'A+';
        if (p95 < 50) return 'A';
        if (p95 < 100) return 'B';
        if (p95 < 200) return 'C';
        if (p95 < 500) return 'D';
        return 'F';
    }

    /**
     * Grade throughput
     */
    gradeThroughput(qps: number): string {
        if (qps >= 5000) return 'A+';
        if (qps >= 3000) return 'A';
        if (qps >= 1000) return 'B';
        if (qps >= 500) return 'C';
        return 'D';
    }

    /**
     * Grade Buffer Pool hit ratio
     */
    gradeBufferPoolHitRatio(hitRatio: number): string {
        if (hitRatio >= 99) return 'A+';
        if (hitRatio >= 95) return 'A';
        if (hitRatio >= 90) return 'B';
        if (hitRatio >= 85) return 'C';
        if (hitRatio >= 80) return 'D';
        return 'F';
    }
}
