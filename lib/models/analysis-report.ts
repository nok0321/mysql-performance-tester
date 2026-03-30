/**
 * AnalysisReport Model - Analysis report model
 *
 * Holds comprehensive analysis of test results
 *
 * Features:
 * - Summary generation
 * - Performance analysis
 * - Detailed analysis information
 * - Recommendation generation
 *
 * @module models/analysis-report
 */

import type { TestResult, ErrorInfo } from './test-result.js';
import type { StatisticsResult } from '../types/index.js';

/** Constructor parameters for AnalysisReport */
interface AnalysisReportParams {
    title: string;
    description?: string;
}

/** Report summary */
export interface ReportSummary {
    totalTests: number;
    totalExecutions: number;
    totalSuccesses?: number;
    overallSuccessRate: number;
    averageP95Latency: number;
    testsWithStatistics: number;
    testsWithAnalysis: number;
    timestamp?: string;
}

/** Per-test performance metric */
interface PerTestMetric {
    testName: string;
    mean: number;
    median: number;
    p95: number;
    p99: number;
    stdDev: number;
    cv: number;
}

/** Overall performance metrics */
interface OverallPerformanceMetrics {
    minLatency: number;
    maxLatency: number;
    avgLatency: number;
    p95Latency: number;
}

/** Performance metrics analysis result */
interface PerformanceMetricsAnalysis {
    byTest: PerTestMetric[];
    overall: OverallPerformanceMetrics;
}

/** Per-test buffer pool data */
interface BufferPoolTestData {
    testName: string;
    hitRatio: number;
    reads: number;
    readRequests: number;
    pagesTotal: number;
    pagesFree: number;
}

/** Buffer pool analysis result */
interface BufferPoolAnalysisResult {
    byTest: BufferPoolTestData[];
    overall: {
        averageHitRatio: number;
        recommendation: string;
    };
}

/** Complex query info */
interface ComplexQueryInfo {
    testName: string;
    query: string;
    hasJoin: boolean;
    hasSubquery: boolean;
}

/** Query patterns analysis result */
interface QueryPatternsAnalysis {
    selectQueries: number;
    insertQueries: number;
    updateQueries: number;
    deleteQueries: number;
    otherQueries: number;
    complexQueries: ComplexQueryInfo[];
}

/** Error analysis per test */
interface ErrorsByTest {
    testName: string;
    errorCount: number;
    errors: ErrorInfo[];
}

/** Error analysis result */
interface ErrorAnalysisResult {
    totalErrors: number;
    errorsByTest: ErrorsByTest[];
    errorTypes: Record<string, number>;
}

/** Detailed analysis result */
interface DetailedAnalysis {
    performanceMetrics: PerformanceMetricsAnalysis;
    bufferPoolAnalysis: BufferPoolAnalysisResult | null;
    queryPatterns: QueryPatternsAnalysis;
    errorAnalysis: ErrorAnalysisResult;
}

/** Recommendation entry */
export interface ReportRecommendation {
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    title: string;
    description: string;
    impact: string;
    details?: ErrorsByTest[];
}

/** JSON representation of AnalysisReport */
interface AnalysisReportJSON {
    title: string;
    description: string;
    timestamp: string;
    summary: ReportSummary;
    analysis: DetailedAnalysis;
    recommendations: ReportRecommendation[];
    metadata: Record<string, unknown>;
    testResults: ReturnType<TestResult['toJSON']>[];
}

/**
 * Analysis report class
 */
export class AnalysisReport {
    public readonly title: string;
    public readonly description: string;
    public readonly timestamp: string;
    public testResults: TestResult[];
    public summary: ReportSummary | null;
    public analysis: DetailedAnalysis | null;
    public recommendations: ReportRecommendation[];
    public metadata: Record<string, unknown>;

    /**
     * Initialize the report
     * @param params - Constructor parameters
     */
    constructor({ title, description = '' }: AnalysisReportParams) {
        this.title = title;
        this.description = description;
        this.timestamp = new Date().toISOString();
        this.testResults = [];
        this.summary = null;
        this.analysis = null;
        this.recommendations = [];
        this.metadata = {};
    }

    /**
     * Add a test result
     * @param testResult - TestResult instance
     */
    addTestResult(testResult: TestResult): void {
        this.testResults.push(testResult);
    }

    /**
     * Generate summary information
     * @returns Summary object
     */
    generateSummary(): ReportSummary {
        if (this.testResults.length === 0) {
            return {
                totalTests: 0,
                totalExecutions: 0,
                overallSuccessRate: 0,
                averageP95Latency: 0,
                testsWithStatistics: 0,
                testsWithAnalysis: 0
            };
        }

        let totalExecutions = 0;
        let totalSuccesses = 0;
        const totalP95Latencies: number[] = [];
        let testsWithStatistics = 0;
        let testsWithAnalysis = 0;

        this.testResults.forEach(result => {
            const summary = result.getSummary();
            totalExecutions += summary.totalExecutions;
            totalSuccesses += summary.successCount;

            const stats = result.statistics as StatisticsResult | null;
            if (stats?.percentiles?.p95) {
                totalP95Latencies.push(stats.percentiles.p95);
            }

            if (summary.hasStatistics) {
                testsWithStatistics++;
            }

            if (Object.values(summary.hasAnalysis).some(v => v)) {
                testsWithAnalysis++;
            }
        });

        const overallSuccessRate = totalExecutions > 0
            ? (totalSuccesses / totalExecutions) * 100
            : 0;

        const averageP95Latency = totalP95Latencies.length > 0
            ? totalP95Latencies.reduce((a, b) => a + b, 0) / totalP95Latencies.length
            : 0;

        this.summary = {
            totalTests: this.testResults.length,
            totalExecutions,
            totalSuccesses,
            overallSuccessRate: this.round(overallSuccessRate, 2),
            averageP95Latency: this.round(averageP95Latency, 3),
            testsWithStatistics,
            testsWithAnalysis,
            timestamp: this.timestamp
        };

        return this.summary;
    }

    /**
     * Perform detailed analysis
     * @returns Detailed analysis object
     */
    performAnalysis(): DetailedAnalysis {
        this.analysis = {
            performanceMetrics: this.analyzePerformanceMetrics(),
            bufferPoolAnalysis: this.analyzeBufferPool(),
            queryPatterns: this.analyzeQueryPatterns(),
            errorAnalysis: this.analyzeErrors()
        };

        return this.analysis;
    }

    /**
     * Analyze performance metrics
     * @returns Performance metrics analysis
     */
    private analyzePerformanceMetrics(): PerformanceMetricsAnalysis {
        const metrics: PerformanceMetricsAnalysis = {
            byTest: [],
            overall: {
                minLatency: Infinity,
                maxLatency: -Infinity,
                avgLatency: 0,
                p95Latency: 0
            }
        };

        let totalLatencies = 0;
        let latencyCount = 0;
        const allP95s: number[] = [];

        this.testResults.forEach(result => {
            const stats = result.statistics as StatisticsResult | null;
            if (stats) {
                const testMetric: PerTestMetric = {
                    testName: result.testName,
                    mean: stats.basic.mean,
                    median: stats.basic.median,
                    p95: stats.percentiles.p95,
                    p99: stats.percentiles.p99,
                    stdDev: stats.spread.stdDev,
                    cv: stats.spread.cv
                };

                metrics.byTest.push(testMetric);

                metrics.overall.minLatency = Math.min(
                    metrics.overall.minLatency,
                    stats.basic.min
                );
                metrics.overall.maxLatency = Math.max(
                    metrics.overall.maxLatency,
                    stats.basic.max
                );

                totalLatencies += stats.basic.mean;
                latencyCount++;
                allP95s.push(stats.percentiles.p95);
            }
        });

        if (latencyCount > 0) {
            metrics.overall.avgLatency = this.round(totalLatencies / latencyCount, 3);
            metrics.overall.p95Latency = this.round(
                allP95s.reduce((a, b) => a + b, 0) / allP95s.length,
                3
            );
            metrics.overall.minLatency = this.round(metrics.overall.minLatency, 3);
            metrics.overall.maxLatency = this.round(metrics.overall.maxLatency, 3);
        } else {
            metrics.overall.minLatency = 0;
            metrics.overall.maxLatency = 0;
        }

        return metrics;
    }

    /**
     * Analyze Buffer Pool status
     * @returns Buffer Pool analysis or null
     */
    private analyzeBufferPool(): BufferPoolAnalysisResult | null {
        const bufferPoolData: BufferPoolTestData[] = [];

        this.testResults.forEach(result => {
            const bpa = result.bufferPoolAnalysis as Record<string, Record<string, number>> | null;
            if (bpa?.metrics) {
                bufferPoolData.push({
                    testName: result.testName,
                    hitRatio: bpa.metrics.hitRatio,
                    reads: bpa.metrics.reads,
                    readRequests: bpa.metrics.readRequests,
                    pagesTotal: bpa.metrics.pagesTotal,
                    pagesFree: bpa.metrics.pagesFree
                });
            }
        });

        if (bufferPoolData.length === 0) {
            return null;
        }

        const avgHitRatio = bufferPoolData.reduce((sum, d) => sum + d.hitRatio, 0) / bufferPoolData.length;

        return {
            byTest: bufferPoolData,
            overall: {
                averageHitRatio: this.round(avgHitRatio, 2),
                recommendation: avgHitRatio < 95
                    ? 'Buffer Pool hit ratio is below 95%. Consider increasing innodb_buffer_pool_size.'
                    : 'Buffer Pool hit ratio is healthy.'
            }
        };
    }

    /**
     * Analyze query patterns
     * @returns Query patterns analysis
     */
    private analyzeQueryPatterns(): QueryPatternsAnalysis {
        const patterns: QueryPatternsAnalysis = {
            selectQueries: 0,
            insertQueries: 0,
            updateQueries: 0,
            deleteQueries: 0,
            otherQueries: 0,
            complexQueries: []
        };

        this.testResults.forEach(result => {
            const query = result.query.trim().toUpperCase();

            if (query.startsWith('SELECT')) {
                patterns.selectQueries++;
            } else if (query.startsWith('INSERT')) {
                patterns.insertQueries++;
            } else if (query.startsWith('UPDATE')) {
                patterns.updateQueries++;
            } else if (query.startsWith('DELETE')) {
                patterns.deleteQueries++;
            } else {
                patterns.otherQueries++;
            }

            // Complex queries (containing JOIN or subqueries)
            if (query.includes('JOIN') || query.includes('SELECT') && query.split('SELECT').length > 2) {
                patterns.complexQueries.push({
                    testName: result.testName,
                    query: result.query.substring(0, 100) + '...',
                    hasJoin: query.includes('JOIN'),
                    hasSubquery: query.split('SELECT').length > 2
                });
            }
        });

        return patterns;
    }

    /**
     * Analyze errors
     * @returns Error analysis result
     */
    private analyzeErrors(): ErrorAnalysisResult {
        const errorAnalysis: ErrorAnalysisResult = {
            totalErrors: 0,
            errorsByTest: [],
            errorTypes: {}
        };

        this.testResults.forEach(result => {
            const errors = result.getErrors();

            if (errors.length > 0) {
                errorAnalysis.totalErrors += errors.length;
                errorAnalysis.errorsByTest.push({
                    testName: result.testName,
                    errorCount: errors.length,
                    errors: errors
                });

                errors.forEach(err => {
                    const errorType = this.categorizeError(err.error);
                    errorAnalysis.errorTypes[errorType] = (errorAnalysis.errorTypes[errorType] || 0) + 1;
                });
            }
        });

        return errorAnalysis;
    }

    /**
     * Categorize an error by its message
     * @param errorMessage - Error message string
     * @returns Error type category
     */
    private categorizeError(errorMessage: string): string {
        const msg = errorMessage.toLowerCase();

        if (msg.includes('timeout') || msg.includes('timed out')) {
            return 'TIMEOUT';
        } else if (msg.includes('connection') || msg.includes('connect')) {
            return 'CONNECTION';
        } else if (msg.includes('syntax')) {
            return 'SYNTAX';
        } else if (msg.includes('deadlock')) {
            return 'DEADLOCK';
        } else if (msg.includes('duplicate') || msg.includes('unique')) {
            return 'DUPLICATE_KEY';
        } else {
            return 'OTHER';
        }
    }

    /**
     * Generate recommendations based on analysis
     * @returns Array of recommendations
     */
    generateRecommendations(): ReportRecommendation[] {
        this.recommendations = [];

        if (!this.summary) {
            this.generateSummary();
        }

        if (!this.analysis) {
            this.performAnalysis();
        }

        // Low success rate
        if (this.summary!.overallSuccessRate < 95) {
            this.recommendations.push({
                priority: 'HIGH',
                category: 'RELIABILITY',
                title: 'Low Success Rate Detected',
                description: `Overall success rate is ${this.summary!.overallSuccessRate}%. Investigate errors and improve query reliability.`,
                impact: 'Application stability may be affected'
            });
        }

        // High P95 latency
        if (this.summary!.averageP95Latency > 100) {
            this.recommendations.push({
                priority: 'MEDIUM',
                category: 'PERFORMANCE',
                title: 'High P95 Latency',
                description: `Average P95 latency is ${this.summary!.averageP95Latency}ms. Consider query optimization or index tuning.`,
                impact: 'User experience may be degraded for some requests'
            });
        }

        // Low Buffer Pool hit ratio
        if (this.analysis!.bufferPoolAnalysis?.overall.averageHitRatio !== undefined
            && this.analysis!.bufferPoolAnalysis.overall.averageHitRatio < 95) {
            this.recommendations.push({
                priority: 'MEDIUM',
                category: 'CONFIGURATION',
                title: 'Buffer Pool Hit Ratio Low',
                description: this.analysis!.bufferPoolAnalysis.overall.recommendation,
                impact: 'Database performance may be limited by disk I/O'
            });
        }

        // Complex queries detected
        if (this.analysis!.queryPatterns.complexQueries.length > 0) {
            this.recommendations.push({
                priority: 'LOW',
                category: 'OPTIMIZATION',
                title: 'Complex Queries Detected',
                description: `Found ${this.analysis!.queryPatterns.complexQueries.length} complex queries. Review for optimization opportunities.`,
                impact: 'Query optimization may improve performance'
            });
        }

        // Errors detected
        if (this.analysis!.errorAnalysis.totalErrors > 0) {
            this.recommendations.push({
                priority: 'HIGH',
                category: 'RELIABILITY',
                title: 'Errors Detected',
                description: `Found ${this.analysis!.errorAnalysis.totalErrors} errors across all tests. Review error details and fix issues.`,
                impact: 'Application functionality may be impaired',
                details: this.analysis!.errorAnalysis.errorsByTest
            });
        }

        return this.recommendations;
    }

    /**
     * Set metadata
     * @param key - Metadata key
     * @param value - Metadata value
     */
    setMetadata(key: string, value: unknown): void {
        this.metadata[key] = value;
    }

    /**
     * Round a number to the specified decimal places
     * @param value - The value to round
     * @param decimals - Number of decimal places
     * @returns Rounded value
     */
    private round(value: number | null | undefined, decimals: number): number {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * Convert to JSON format
     * @returns JSON object
     */
    toJSON(): AnalysisReportJSON {
        return {
            title: this.title,
            description: this.description,
            timestamp: this.timestamp,
            summary: this.summary || this.generateSummary(),
            analysis: this.analysis || this.performAnalysis(),
            recommendations: this.recommendations.length > 0
                ? this.recommendations
                : this.generateRecommendations(),
            metadata: this.metadata,
            testResults: this.testResults.map(r => r.toJSON())
        };
    }

    /**
     * Generate a text report
     * @returns Text-formatted report string
     */
    toTextReport(): string {
        const lines: string[] = [];
        lines.push('='.repeat(60));
        lines.push(`  ${this.title}`);
        lines.push('='.repeat(60));
        lines.push(`Generated: ${this.timestamp}`);
        lines.push('');

        // Summary
        const summary = this.summary || this.generateSummary();
        lines.push('SUMMARY');
        lines.push('-'.repeat(60));
        lines.push(`Total Tests: ${summary.totalTests}`);
        lines.push(`Total Executions: ${summary.totalExecutions}`);
        lines.push(`Overall Success Rate: ${summary.overallSuccessRate}%`);
        lines.push(`Average P95 Latency: ${summary.averageP95Latency}ms`);
        lines.push('');

        // Recommendations
        const recommendations = this.recommendations.length > 0
            ? this.recommendations
            : this.generateRecommendations();

        if (recommendations.length > 0) {
            lines.push('RECOMMENDATIONS');
            lines.push('-'.repeat(60));
            recommendations.forEach((rec, i) => {
                lines.push(`${i + 1}. [${rec.priority}] ${rec.title}`);
                lines.push(`   ${rec.description}`);
                lines.push('');
            });
        }

        lines.push('='.repeat(60));

        return lines.join('\n');
    }
}

export default AnalysisReport;
