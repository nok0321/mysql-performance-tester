/**
 * AnalysisReport Model - 分析レポートモデル
 *
 * テスト結果の総合分析を保持
 *
 * 機能:
 * - サマリー生成
 * - パフォーマンス分析
 * - 詳細な分析情報
 * - 推奨事項の生成
 *
 * @module models/analysis-report
 */

/**
 * 分析レポートクラス
 */
export class AnalysisReport {
    /**
     * レポートを初期化
     * @param {Object} params - パラメータ
     * @param {string} params.title - レポートタイトル
     * @param {string} [params.description] - レポート説明
     */
    constructor({ title, description = '' }) {
        this.title = title;
        this.description = description;
        this.timestamp = new Date().toISOString();
        this.testResults = []; // TestResultインスタンスの配列
        this.summary = null; // サマリー情報
        this.analysis = null; // 詳細な分析情報
        this.recommendations = []; // 推奨事項
        this.metadata = {}; // メタデータ
    }

    /**
     * テスト結果を追加
     * @param {Object} testResult - TestResultインスタンス
     */
    addTestResult(testResult) {
        this.testResults.push(testResult);
    }

    /**
     * サマリー情報を生成
     * @returns {Object} サマリー情報
     */
    generateSummary() {
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
        let totalP95Latencies = [];
        let testsWithStatistics = 0;
        let testsWithAnalysis = 0;

        this.testResults.forEach(result => {
            const summary = result.getSummary();
            totalExecutions += summary.totalExecutions;
            totalSuccesses += summary.successCount;

            if (result.statistics?.percentiles?.p95) {
                totalP95Latencies.push(result.statistics.percentiles.p95);
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
     * 詳細分析を実行
     * @returns {Object} 詳細な分析情報
     */
    performAnalysis() {
        this.analysis = {
            performanceMetrics: this.analyzePerformanceMetrics(),
            bufferPoolAnalysis: this.analyzeBufferPool(),
            queryPatterns: this.analyzeQueryPatterns(),
            errorAnalysis: this.analyzeErrors()
        };

        return this.analysis;
    }

    /**
     * パフォーマンス指標を分析
     * @returns {Object} パフォーマンス分析
     */
    analyzePerformanceMetrics() {
        const metrics = {
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
        const allP95s = [];

        this.testResults.forEach(result => {
            if (result.statistics) {
                const testMetric = {
                    testName: result.testName,
                    mean: result.statistics.basic.mean,
                    median: result.statistics.basic.median,
                    p95: result.statistics.percentiles.p95,
                    p99: result.statistics.percentiles.p99,
                    stdDev: result.statistics.spread.stdDev,
                    cv: result.statistics.spread.cv
                };

                metrics.byTest.push(testMetric);

                metrics.overall.minLatency = Math.min(
                    metrics.overall.minLatency,
                    result.statistics.basic.min
                );
                metrics.overall.maxLatency = Math.max(
                    metrics.overall.maxLatency,
                    result.statistics.basic.max
                );

                totalLatencies += result.statistics.basic.mean;
                latencyCount++;
                allP95s.push(result.statistics.percentiles.p95);
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
     * Buffer Pool状況を分析
     * @returns {Object|null} Buffer Pool分析
     */
    analyzeBufferPool() {
        const bufferPoolData = [];

        this.testResults.forEach(result => {
            if (result.bufferPoolAnalysis?.metrics) {
                bufferPoolData.push({
                    testName: result.testName,
                    hitRatio: result.bufferPoolAnalysis.metrics.hitRatio,
                    reads: result.bufferPoolAnalysis.metrics.reads,
                    readRequests: result.bufferPoolAnalysis.metrics.readRequests,
                    pagesTotal: result.bufferPoolAnalysis.metrics.pagesTotal,
                    pagesFree: result.bufferPoolAnalysis.metrics.pagesFree
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
     * クエリパターンを分析
     * @returns {Object} クエリパターン分析
     */
    analyzeQueryPatterns() {
        const patterns = {
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

            // 複雑なクエリ（JOINやサブクエリを含む）
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
     * エラーを分析
     * @returns {Object} エラー分析
     */
    analyzeErrors() {
        const errorAnalysis = {
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
     * エラーを分類
     * @param {string} errorMessage - エラーメッセージ
     * @returns {string} エラータイプ
     */
    categorizeError(errorMessage) {
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
     * 推奨事項を生成
     * @returns {Array<Object>} 推奨事項の配列
     */
    generateRecommendations() {
        this.recommendations = [];

        if (!this.summary) {
            this.generateSummary();
        }

        if (!this.analysis) {
            this.performAnalysis();
        }

        // 成功率が低い場合
        if (this.summary.overallSuccessRate < 95) {
            this.recommendations.push({
                priority: 'HIGH',
                category: 'RELIABILITY',
                title: 'Low Success Rate Detected',
                description: `Overall success rate is ${this.summary.overallSuccessRate}%. Investigate errors and improve query reliability.`,
                impact: 'Application stability may be affected'
            });
        }

        // P95レイテンシが高い場合
        if (this.summary.averageP95Latency > 100) {
            this.recommendations.push({
                priority: 'MEDIUM',
                category: 'PERFORMANCE',
                title: 'High P95 Latency',
                description: `Average P95 latency is ${this.summary.averageP95Latency}ms. Consider query optimization or index tuning.`,
                impact: 'User experience may be degraded for some requests'
            });
        }

        // Buffer Poolヒット率が低い場合の推奨
        if (this.analysis.bufferPoolAnalysis?.overall.averageHitRatio < 95) {
            this.recommendations.push({
                priority: 'MEDIUM',
                category: 'CONFIGURATION',
                title: 'Buffer Pool Hit Ratio Low',
                description: this.analysis.bufferPoolAnalysis.overall.recommendation,
                impact: 'Database performance may be limited by disk I/O'
            });
        }

        // 複雑なクエリが存在する場合
        if (this.analysis.queryPatterns.complexQueries.length > 0) {
            this.recommendations.push({
                priority: 'LOW',
                category: 'OPTIMIZATION',
                title: 'Complex Queries Detected',
                description: `Found ${this.analysis.queryPatterns.complexQueries.length} complex queries. Review for optimization opportunities.`,
                impact: 'Query optimization may improve performance'
            });
        }

        // エラーが存在する場合
        if (this.analysis.errorAnalysis.totalErrors > 0) {
            this.recommendations.push({
                priority: 'HIGH',
                category: 'RELIABILITY',
                title: 'Errors Detected',
                description: `Found ${this.analysis.errorAnalysis.totalErrors} errors across all tests. Review error details and fix issues.`,
                impact: 'Application functionality may be impaired',
                details: this.analysis.errorAnalysis.errorsByTest
            });
        }

        return this.recommendations;
    }

    /**
     * メタデータを設定
     * @param {string} key - キー
     * @param {*} value - 値
     */
    setMetadata(key, value) {
        this.metadata[key] = value;
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
     * テキストレポートを生成
     * @returns {string} テキスト形式のレポート
     */
    toTextReport() {
        const lines = [];
        lines.push('='.repeat(60));
        lines.push(`  ${this.title}`);
        lines.push('='.repeat(60));
        lines.push(`Generated: ${this.timestamp}`);
        lines.push('');

        // サマリー
        const summary = this.summary || this.generateSummary();
        lines.push('SUMMARY');
        lines.push('-'.repeat(60));
        lines.push(`Total Tests: ${summary.totalTests}`);
        lines.push(`Total Executions: ${summary.totalExecutions}`);
        lines.push(`Overall Success Rate: ${summary.overallSuccessRate}%`);
        lines.push(`Average P95 Latency: ${summary.averageP95Latency}ms`);
        lines.push('');

        // 推奨事項
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
