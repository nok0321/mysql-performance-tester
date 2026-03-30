/**
 * HTML Exporter
 * Exports report data in a visually rich HTML format
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

interface HtmlPerFileStats {
    completed: number;
    failed: number;
    successRate: string;
    latency?: {
        mean?: number;
        p50?: number;
        p95?: number;
        p99?: number;
        min?: number;
        max?: number;
    };
}

interface HtmlParallelMetrics {
    strategy?: string;
    duration?: { total?: number; seconds?: number };
    queries?: { total?: number; completed?: number; failed?: number; successRate?: string };
    throughput?: { qps?: number; effectiveQps?: number; grade?: string; interpretation?: string[] };
    latency?: {
        percentiles?: { p50?: number; p95?: number; p99?: number };
        basic?: { mean?: number; min?: number; max?: number };
        spread?: { stdDev?: number; cv?: number };
        grade?: string;
        interpretation?: string[];
    };
    perFile?: Record<string, HtmlPerFileStats>;
}

interface HtmlStatistics {
    grade?: string;
    percentiles?: Record<string, number>;
    basic?: Record<string, number>;
    count?: Record<string, number>;
    spread?: Record<string, number>;
    interpretation?: string[];
}

interface HtmlBufferPool {
    grade: string;
    hitRatio: number;
    pagesTotal: number;
    pagesData: number;
    pagesFree: number;
    interpretation?: string[];
}

interface HtmlPerformanceSchema {
    connections?: Record<string, number>;
    slowQueries?: Array<{
        avgLatency: number;
        executionCount: number;
        needsOptimization: boolean;
    }>;
}

interface HtmlTestDetail {
    testName: string;
    query?: string;
    isParallelTest?: boolean;
    parallelMetrics?: HtmlParallelMetrics;
    statistics?: HtmlStatistics;
    bufferPool?: HtmlBufferPool;
    performanceSchema?: HtmlPerformanceSchema;
}

interface HtmlRecommendation {
    title: string;
    priority: string;
    description: string;
    actions: string[];
}

interface HtmlReportData {
    metadata: {
        generatedAt: string;
        totalTests: number;
        configuration?: Record<string, unknown>;
    };
    summary: {
        performanceGrade: string;
        overallMetrics: {
            averageP95: string | null;
            maxQPS: string | null;
        };
        testCount: {
            total: number;
            successful: number;
        };
    };
    recommendations: HtmlRecommendation[];
    details: HtmlTestDetail[];
}

/**
 * HTML exporter class
 */
export class HtmlExporter extends BaseExporter {
    /**
     * Export report as an HTML file
     */
    async export(reportData: Record<string, unknown>, outputDir: string): Promise<string> {
        await fs.mkdir(outputDir, { recursive: true });

        const htmlPath = path.join(outputDir, 'analysis-report.html');
        const htmlContent = this.generateHtmlReport(reportData as unknown as HtmlReportData);
        await fs.writeFile(htmlPath, htmlContent, 'utf8');

        return htmlPath;
    }

    /**
     * Generate HTML report
     */
    generateHtmlReport(reportData: HtmlReportData): string {
        const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MySQL Performance Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; margin-bottom: 10px; font-size: 32px; }
        h2 { color: #34495e; margin-top: 30px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #3498db; }
        h3 { color: #555; margin-top: 20px; margin-bottom: 10px; }
        h4 { color: #666; margin-top: 15px; margin-bottom: 8px; }
        .metadata { background: #ecf0f1; padding: 15px; border-radius: 5px; margin-bottom: 30px; }
        .metadata p { margin: 5px 0; color: #555; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
        .metric-card h3 { color: white; margin: 0 0 10px 0; }
        .metric-card .value { font-size: 32px; font-weight: bold; }
        .metric-card .label { opacity: 0.9; margin-top: 5px; }
        .grade { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; }
        .grade.A-plus, .grade.A { background: #27ae60; color: white; }
        .grade.B { background: #f39c12; color: white; }
        .grade.C { background: #e67e22; color: white; }
        .grade.D, .grade.F { background: #c0392b; color: white; }
        .test-detail { background: #f8f9fa; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #3498db; }
        .test-detail h3 { margin-top: 0; color: #2c3e50; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0; }
        .stat-item { background: white; padding: 15px; border-radius: 5px; }
        .stat-item .label { color: #7f8c8d; font-size: 14px; }
        .stat-item .value { font-size: 24px; font-weight: bold; color: #2c3e50; margin-top: 5px; }
        .recommendation { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .recommendation.high { background: #f8d7da; border-left-color: #dc3545; }
        .recommendation.medium { background: #fff3cd; border-left-color: #ffc107; }
        .recommendation.low { background: #d1ecf1; border-left-color: #17a2b8; }
        .recommendation h4 { margin-bottom: 10px; color: #856404; }
        .recommendation.high h4 { color: #721c24; }
        .recommendation ul { margin-left: 20px; margin-top: 10px; }
        .interpretation { background: #e8f4f8; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .interpretation ul { list-style: none; padding-left: 0; }
        .interpretation li { padding: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #3498db; color: white; font-weight: 600; }
        tr:hover { background: #f5f5f5; }
        .percentile-table { background: white; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
        .query-box { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 10px 0; overflow-x: auto; }
        .query-box code { background: transparent; color: #ecf0f1; }
        .parallel-summary { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .metric-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ecf0f1; }
        .metric-label { color: #7f8c8d; font-weight: 500; }
        .metric-value { color: #2c3e50; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MySQL Performance Test Report</h1>
        <div class="metadata">
            <p><strong>生成日時:</strong> ${reportData.metadata.generatedAt}</p>
            <p><strong>総テスト数:</strong> ${reportData.metadata.totalTests}</p>
            ${reportData.metadata.configuration ? `<p><strong>MySQL Host:</strong> ${(reportData.metadata.configuration.database as Record<string, unknown>)?.host || 'N/A'}</p>` : ''}
        </div>

        <h2>サマリー</h2>
        <div class="summary">
            <div class="metric-card">
                <h3>総合評価</h3>
                <div class="value">${reportData.summary.performanceGrade}</div>
                <div class="label">Performance Grade</div>
            </div>
            <div class="metric-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <h3>平均P95</h3>
                <div class="value">${reportData.summary.overallMetrics.averageP95 || 'N/A'}</div>
                <div class="label">milliseconds</div>
            </div>
            <div class="metric-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                <h3>最大QPS</h3>
                <div class="value">${reportData.summary.overallMetrics.maxQPS || 'N/A'}</div>
                <div class="label">queries/second</div>
            </div>
            <div class="metric-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                <h3>成功率</h3>
                <div class="value">${((reportData.summary.testCount.successful / reportData.summary.testCount.total) * 100).toFixed(1)}%</div>
                <div class="label">${reportData.summary.testCount.successful} / ${reportData.summary.testCount.total} tests</div>
            </div>
        </div>

        ${this.generateRecommendationsHTML(reportData)}
        ${this.generateTestDetailsHTML(reportData)}
    </div>
</body>
</html>
        `;

        return html;
    }

    /**
     * Generate recommendations HTML
     */
    generateRecommendationsHTML(reportData: HtmlReportData): string {
        if (!reportData.recommendations || reportData.recommendations.length === 0) {
            return '<h2>推奨事項</h2><p>問題は検出されませんでした。</p>';
        }

        let html = '<h2>推奨事項</h2>';

        reportData.recommendations.forEach(rec => {
            const safePriority = this.escapeHtml(rec.priority);
            html += `
                <div class="recommendation ${safePriority}">
                    <h4>${this.escapeHtml(rec.title)} [${safePriority.toUpperCase()}]</h4>
                    <p>${this.escapeHtml(rec.description)}</p>
                    <ul>
                        ${rec.actions.map(action => `<li>${this.escapeHtml(action)}</li>`).join('')}
                    </ul>
                </div>
            `;
        });

        return html;
    }

    /**
     * Generate test details HTML
     */
    generateTestDetailsHTML(reportData: HtmlReportData): string {
        let html = '<h2>テスト詳細</h2>';

        reportData.details.forEach((detail, index) => {
            // Show query only if it exists
            const queryHtml = detail.query
                ? `<div class="query-box"><code>${this.escapeHtml(detail.query)}</code></div>`
                : '';

            // Different display for parallel tests
            if (detail.isParallelTest && detail.parallelMetrics) {
                const grade = this.escapeHtml(detail.parallelMetrics.throughput?.grade || detail.parallelMetrics.latency?.grade || 'N/A');
                html += `
                    <div class="test-detail">
                        <h3>${index + 1}. ${this.escapeHtml(detail.testName)} <span class="grade ${grade}">${grade}</span></h3>
                        ${queryHtml}

                        ${this.generateParallelMetricsHTML(detail.parallelMetrics)}
                    </div>
                `;
            } else {
                // Normal test display
                const grade = this.escapeHtml(detail.statistics?.grade || 'N/A');
                html += `
                    <div class="test-detail">
                        <h3>${index + 1}. ${this.escapeHtml(detail.testName)} <span class="grade ${grade}">${grade}</span></h3>
                        ${queryHtml}

                        ${this.generateStatisticsHTML(detail.statistics)}
                        ${this.generateInterpretationHTML(detail.statistics?.interpretation)}
                        ${this.generateBufferPoolHTML(detail.bufferPool)}
                        ${this.generatePerformanceSchemaHTML(detail.performanceSchema)}
                    </div>
                `;
            }
        });

        return html;
    }

    /**
     * Generate parallel metrics HTML
     */
    generateParallelMetricsHTML(metrics: HtmlParallelMetrics | undefined): string {
        if (!metrics) return '';

        let html = `
            <h4>並列実行メトリクス</h4>
            <div class="parallel-summary">
                <div class="metric-row">
                    <span class="metric-label">配布戦略:</span>
                    <span class="metric-value"><strong>${this.escapeHtml(metrics.strategy || 'N/A')}</strong></span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">総実行時間:</span>
                    <span class="metric-value">${metrics.duration?.total?.toFixed(2) || 'N/A'}ms (${metrics.duration?.seconds?.toFixed(3) || 'N/A'}秒)</span>
                </div>
            </div>
        `;

        // Query execution count
        if (metrics.queries) {
            html += `
            <h4>クエリ実行数</h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="label">総クエリ数</div>
                    <div class="value">${metrics.queries.total || 'N/A'}</div>
                </div>
                <div class="stat-item">
                    <div class="label">成功</div>
                    <div class="value" style="color: #28a745;">${metrics.queries.completed || 'N/A'}</div>
                </div>
                <div class="stat-item">
                    <div class="label">失敗</div>
                    <div class="value" style="color: ${(metrics.queries.failed || 0) > 0 ? '#dc3545' : '#6c757d'};">${metrics.queries.failed || 0}</div>
                </div>
                <div class="stat-item">
                    <div class="label">成功率</div>
                    <div class="value">${metrics.queries.successRate || 'N/A'}</div>
                </div>
            </div>
            `;
        }

        // Throughput
        if (metrics.throughput) {
            const tGrade = this.escapeHtml(metrics.throughput.grade);
            html += `
            <h4>スループット <span class="grade ${tGrade}">${tGrade}</span></h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="label">QPS</div>
                    <div class="value"><strong>${metrics.throughput.qps?.toFixed(2) || 'N/A'}</strong></div>
                </div>
                <div class="stat-item">
                    <div class="label">実効QPS</div>
                    <div class="value">${metrics.throughput.effectiveQps?.toFixed(2) || 'N/A'}</div>
                </div>
            </div>
            ${this.generateInterpretationHTML(metrics.throughput.interpretation)}
            `;
        }

        // Latency statistics
        if (metrics.latency) {
            const lGrade = this.escapeHtml(metrics.latency.grade);
            html += `
            <h4>レイテンシ統計 <span class="grade ${lGrade}">${lGrade}</span></h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="label">P50 (中央値)</div>
                    <div class="value">${metrics.latency.percentiles?.p50 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">P95</div>
                    <div class="value">${metrics.latency.percentiles?.p95 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">P99</div>
                    <div class="value">${metrics.latency.percentiles?.p99 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">平均</div>
                    <div class="value">${metrics.latency.basic?.mean || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">最小</div>
                    <div class="value">${metrics.latency.basic?.min || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">最大</div>
                    <div class="value">${metrics.latency.basic?.max || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">標準偏差</div>
                    <div class="value">${metrics.latency.spread?.stdDev || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">変動係数</div>
                    <div class="value">${metrics.latency.spread?.cv || 'N/A'}%</div>
                </div>
            </div>
            ${this.generateInterpretationHTML(metrics.latency.interpretation)}
            `;
        }

        // Per-file breakdown
        const perFile = metrics.perFile || {};
        const fileEntries = Object.entries(perFile);
        if (fileEntries.length > 0) {
            html += `
            <h4>SQLファイル別内訳</h4>
            <table>
                <thead>
                    <tr>
                        <th>ファイル名</th>
                        <th style="text-align:right">成功</th>
                        <th style="text-align:right">失敗</th>
                        <th style="text-align:right">成功率</th>
                        <th style="text-align:right">平均(ms)</th>
                        <th style="text-align:right">P50(ms)</th>
                        <th style="text-align:right">P95(ms)</th>
                        <th style="text-align:right">P99(ms)</th>
                        <th style="text-align:right">最小(ms)</th>
                        <th style="text-align:right">最大(ms)</th>
                    </tr>
                </thead>
                <tbody>
                    ${fileEntries.map(([fileName, fileStats]) => `
                    <tr>
                        <td><code>${this.escapeHtml(fileName)}</code></td>
                        <td style="text-align:right">${fileStats.completed}</td>
                        <td style="text-align:right">${fileStats.failed}</td>
                        <td style="text-align:right">${fileStats.successRate}</td>
                        <td style="text-align:right">${fileStats.latency?.mean ?? '-'}</td>
                        <td style="text-align:right">${fileStats.latency?.p50 ?? '-'}</td>
                        <td style="text-align:right;color:#e67e22"><strong>${fileStats.latency?.p95 ?? '-'}</strong></td>
                        <td style="text-align:right">${fileStats.latency?.p99 ?? '-'}</td>
                        <td style="text-align:right;color:#27ae60">${fileStats.latency?.min ?? '-'}</td>
                        <td style="text-align:right;color:#c0392b">${fileStats.latency?.max ?? '-'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            `;
        }

        return html;
    }

    /**
     * Generate statistics HTML
     */
    generateStatisticsHTML(statistics: HtmlStatistics | undefined): string {
        if (!statistics) return '';

        return `
            <h4>統計情報</h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="label">P50 (中央値)</div>
                    <div class="value">${statistics.percentiles?.p50 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">P95</div>
                    <div class="value">${statistics.percentiles?.p95 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">P99</div>
                    <div class="value">${statistics.percentiles?.p99 || 'N/A'}ms</div>
                </div>
                <div class="stat-item">
                    <div class="label">平均</div>
                    <div class="value">${statistics.basic?.mean || 'N/A'}ms</div>
                </div>
            </div>

            <table class="percentile-table">
                <thead>
                    <tr>
                        <th>メトリクス</th>
                        <th>値</th>
                        <th>説明</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>実行回数</td>
                        <td>${statistics.count?.included || 'N/A'}</td>
                        <td>測定に使用されたクエリ数</td>
                    </tr>
                    <tr>
                        <td>標準偏差</td>
                        <td>${statistics.spread?.stdDev || 'N/A'}ms</td>
                        <td>データのばらつき</td>
                    </tr>
                    <tr>
                        <td>変動係数</td>
                        <td>${statistics.spread?.cv || 'N/A'}%</td>
                        <td>相対的なばらつき（低いほど安定）</td>
                    </tr>
                    <tr>
                        <td>IQR</td>
                        <td>${statistics.spread?.iqr || 'N/A'}ms</td>
                        <td>中央50%の範囲</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    /**
     * Generate interpretation HTML
     */
    generateInterpretationHTML(interpretation: string[] | undefined): string {
        if (!interpretation || interpretation.length === 0) return '';

        return `
            <div class="interpretation">
                <h4>分析結果</h4>
                <ul>
                    ${interpretation.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * Generate Buffer Pool HTML
     */
    generateBufferPoolHTML(bufferPool: HtmlBufferPool | undefined): string {
        if (!bufferPool) return '';

        const bpGrade = this.escapeHtml(bufferPool.grade);
        return `
            <h4>Buffer Pool <span class="grade ${bpGrade}">${bpGrade}</span></h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="label">ヒット率</div>
                    <div class="value">${bufferPool.hitRatio}%</div>
                </div>
                <div class="stat-item">
                    <div class="label">総ページ数</div>
                    <div class="value">${bufferPool.pagesTotal}</div>
                </div>
                <div class="stat-item">
                    <div class="label">データページ</div>
                    <div class="value">${bufferPool.pagesData}</div>
                </div>
                <div class="stat-item">
                    <div class="label">空きページ</div>
                    <div class="value">${bufferPool.pagesFree}</div>
                </div>
            </div>
            ${this.generateInterpretationHTML(bufferPool.interpretation)}
        `;
    }

    /**
     * Generate Performance Schema HTML
     */
    generatePerformanceSchemaHTML(ps: HtmlPerformanceSchema | undefined): string {
        if (!ps) return '';

        let html = '<h4>Performance Schema</h4>';

        if (ps.connections) {
            html += `
                <p><strong>接続状況:</strong> ${ps.connections.Threads_connected} 接続中 / ${ps.connections.Threads_running} 実行中</p>
            `;
        }

        if (ps.slowQueries && ps.slowQueries.length > 0) {
            html += `
                <p><strong>遅いクエリ（トップ3）:</strong></p>
                <ul>
                    ${ps.slowQueries.slice(0, 3).map(q =>
                `<li>平均 ${q.avgLatency}ms, 実行回数: ${q.executionCount}${q.needsOptimization ? ' (要最適化)' : ''}</li>`
            ).join('')}
                </ul>
            `;
        }

        return html;
    }

    /**
     * HTML escape
     */
    escapeHtml(text: string | number | null | undefined): string {
        // Return empty string for undefined or null
        if (text === undefined || text === null) {
            return '';
        }

        // Convert to string if not a string
        let str: string;
        if (typeof text !== 'string') {
            str = String(text);
        } else {
            str = text;
        }

        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    }
}
