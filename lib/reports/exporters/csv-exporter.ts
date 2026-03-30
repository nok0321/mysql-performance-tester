/**
 * CSV Exporter
 * Exports report data in CSV format suitable for Excel analysis
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

type CsvCell = string | number | boolean | null | undefined;
type CsvRow = CsvCell[];

interface CsvReportFiles {
    summary?: string;
    testsOverview?: string;
    detailedStats?: string;
    parallelMetrics?: string;
    recommendations?: string;
    warmup?: string;
}

/**
 * CSV exporter class
 */
export class CsvExporter extends BaseExporter {
    report: Record<string, unknown>;

    constructor(analysisReport?: Record<string, unknown>) {
        super();
        this.report = analysisReport || {};
    }

    /**
     * Export report as CSV files
     */
    // @ts-expect-error CsvExporter returns an object of file paths instead of a single string
    async export(reportData: Record<string, unknown>, outputDir: string): Promise<string | CsvReportFiles> {
        this.report = reportData;
        return await this.generateAllReports(outputDir);
    }

    /**
     * Generate all CSV reports
     * @param outputDir - Output directory
     * @returns Paths of generated files
     */
    async generateAllReports(outputDir: string): Promise<CsvReportFiles> {
        // Create output directory
        await fs.mkdir(outputDir, { recursive: true });

        const files: CsvReportFiles = {};

        // 1. Summary CSV
        files.summary = await this.generateSummaryCSV(
            path.join(outputDir, 'summary.csv')
        );

        // 2. Tests overview CSV
        files.testsOverview = await this.generateTestsOverviewCSV(
            path.join(outputDir, 'tests_overview.csv')
        );

        // 3. Detailed statistics CSV
        files.detailedStats = await this.generateDetailedStatisticsCSV(
            path.join(outputDir, 'detailed_statistics.csv')
        );

        // 4. Parallel metrics CSV
        files.parallelMetrics = await this.generateParallelMetricsCSV(
            path.join(outputDir, 'parallel_metrics.csv')
        );

        // 5. Recommendations CSV
        files.recommendations = await this.generateRecommendationsCSV(
            path.join(outputDir, 'recommendations.csv')
        );

        // 6. Warmup analysis CSV
        files.warmup = await this.generateWarmupAnalysisCSV(
            path.join(outputDir, 'warmup_analysis.csv')
        );

        return files;
    }

    /**
     * 1. Generate summary CSV
     */
    async generateSummaryCSV(filePath: string): Promise<string> {
        const summary = this.report.summary as Record<string, unknown>;
        const metadata = this.report.metadata as Record<string, unknown>;
        const config = (metadata?.configuration as Record<string, unknown>) || {};
        const testCount = (summary?.testCount as Record<string, unknown>) || {};
        const overallMetrics = (summary?.overallMetrics as Record<string, unknown>) || {};
        const dbConfig = (config.database as Record<string, unknown>) || {};
        const testConfig = (config.test as Record<string, unknown>) || {};

        const rows: CsvRow[] = [
            ['項目', '値'],
            ['生成日時', metadata?.generatedAt as string],
            ['総テスト数', testCount.total as number],
            ['成功', testCount.successful as number],
            ['失敗', testCount.failed as number],
            ['総合評価', (summary?.performanceGrade as string) || ''],
            ['総クエリ数', overallMetrics.totalQueries as number],
            ['平均P95 (ms)', overallMetrics.averageP95 as string],
            ['最大QPS', overallMetrics.maxQPS as string],
            ['平均QPS', overallMetrics.avgQPS as string],
            ['', ''],
            ['データベース情報', ''],
            ['ホスト', (dbConfig.host as string) || 'N/A'],
            ['ポート', (dbConfig.port as string) || 'N/A'],
            ['データベース名', (dbConfig.database as string) || 'N/A'],
            ['', ''],
            ['テスト設定', ''],
            ['テスト反復回数', (testConfig.testIterations as number) || 'N/A'],
            ['並列スレッド数', (testConfig.parallelThreads as number) || 'N/A'],
            ['ウォームアップ有効', testConfig.enableWarmup ? 'はい' : 'いいえ'],
            ['外れ値除外', testConfig.removeOutliers ? 'はい' : 'いいえ'],
            ['外れ値検出手法', (testConfig.outlierMethod as string) || 'N/A']
        ];

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 2. Generate tests overview CSV
     */
    async generateTestsOverviewCSV(filePath: string): Promise<string> {
        const headers: CsvRow = [
            'テスト名',
            'クエリ',
            'タイムスタンプ',
            '実行回数',
            '成功',
            '失敗',
            '成功率(%)',
            '平均(ms)',
            '中央値(ms)',
            'P95(ms)',
            'P99(ms)',
            '最小(ms)',
            '最大(ms)',
            '標準偏差(ms)',
            '変動係数(%)',
            '外れ値数',
            '評価'
        ];

        const rows: CsvRow[] = [headers];
        const details = (this.report.details as Record<string, unknown>[]) || [];

        for (const test of details) {
            const stats = test.statistics as Record<string, unknown>;
            if (!stats) continue;

            const parallelMetrics = test.parallelMetrics as Record<string, unknown> | undefined;
            const execution = parallelMetrics?.execution as Record<string, unknown> | undefined;
            const count = stats.count as Record<string, number> | undefined;
            const basic = stats.basic as Record<string, number> | undefined;
            const percentiles = stats.percentiles as Record<string, number> | undefined;
            const spread = stats.spread as Record<string, number> | undefined;
            const outliers = stats.outliers as Record<string, number> | undefined;

            // Calculate success/failure
            let successCount: CsvCell;
            let failureCount: CsvCell;
            let successRate: CsvCell;
            if (execution) {
                successCount = execution.successCount as number;
                failureCount = execution.failureCount as number;
                successRate = execution.successRate as number;
            } else if (count) {
                successCount = count.included;
                failureCount = 0;
                successRate = 100;
            } else {
                successCount = '-';
                failureCount = '-';
                successRate = '-';
            }

            rows.push([
                test.testName as string,
                this.cleanQuery(test.query as string | undefined),
                test.timestamp as string,
                count?.total || '-',
                successCount,
                failureCount,
                successRate,
                basic?.mean || '-',
                basic?.median || '-',
                percentiles?.p95 || '-',
                percentiles?.p99 || '-',
                basic?.min || '-',
                basic?.max || '-',
                spread?.stdDev || '-',
                spread?.cv || '-',
                outliers?.count || 0,
                (test.performanceGrade as string) || (stats.grade as string) || '-'
            ]);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 3. Generate detailed statistics CSV (including percentiles)
     */
    async generateDetailedStatisticsCSV(filePath: string): Promise<string> {
        const headers: CsvRow = [
            'テスト名',
            '実行回数',
            '外れ値数',
            '最小(ms)',
            '最大(ms)',
            '平均(ms)',
            '中央値(ms)',
            '標準偏差(ms)',
            '変動係数(%)',
            'P1(ms)',
            'P5(ms)',
            'P10(ms)',
            'P25(ms)',
            'P50(ms)',
            'P75(ms)',
            'P90(ms)',
            'P95(ms)',
            'P99(ms)',
            'P99.9(ms)',
            'IQR(ms)',
            'Range(ms)'
        ];

        const rows: CsvRow[] = [headers];
        const details = (this.report.details as Record<string, unknown>[]) || [];

        for (const test of details) {
            const stats = test.statistics as Record<string, unknown>;
            if (!stats) continue;

            const perc = (stats.percentiles as Record<string, number>) || {};
            const basic = (stats.basic as Record<string, number>) || {};
            const spread = (stats.spread as Record<string, number>) || {};
            const count = (stats.count as Record<string, number>) || {};
            const outliers = stats.outliers as Record<string, number> | undefined;

            rows.push([
                test.testName as string,
                count.total || '-',
                outliers?.count || 0,
                basic.min || '-',
                basic.max || '-',
                basic.mean || '-',
                basic.median || '-',
                spread.stdDev || '-',
                spread.cv || '-',
                perc.p01 || '-',
                perc.p05 || '-',
                perc.p10 || '-',
                perc.p25 || '-',
                perc.p50 || '-',
                perc.p75 || '-',
                perc.p90 || '-',
                perc.p95 || '-',
                perc.p99 || '-',
                perc.p999 || '-',
                spread.iqr || '-',
                spread.range || '-'
            ]);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 4. Generate parallel metrics CSV
     */
    async generateParallelMetricsCSV(filePath: string): Promise<string> {
        const headers: CsvRow = [
            'テスト名',
            '配布戦略',
            'スレッド数',
            '総実行時間(ms)',
            '総クエリ数',
            '成功数',
            '失敗数',
            '成功率(%)',
            'QPS',
            '実効QPS',
            'QPS評価',
            'P50(ms)',
            'P95(ms)',
            'P99(ms)',
            '平均(ms)',
            'レイテンシ評価',
            'スループット評価',
            '全体評価',
            'SQLファイル',
            'ファイル成功',
            'ファイル失敗',
            'ファイル成功率',
            'ファイル平均(ms)',
            'ファイルP50(ms)',
            'ファイルP95(ms)',
            'ファイルP99(ms)',
            'ファイル最小(ms)',
            'ファイル最大(ms)'
        ];

        const rows: CsvRow[] = [headers];
        const details = (this.report.details as Record<string, unknown>[]) || [];

        for (const test of details) {
            const pm = test.parallelMetrics as Record<string, unknown> | undefined;
            if (!pm) continue;

            const exec = (pm.execution as Record<string, unknown>) || {};
            const perf = (pm.performance as Record<string, unknown>) || {};
            const qps = (perf.qps as Record<string, unknown>) || {};
            const latency = (perf.latency as Record<string, unknown>) || {};
            const throughput = (perf.throughput as Record<string, unknown>) || {};
            const pmThroughput = (pm.throughput as Record<string, unknown>) || {};
            const pmLatency = (pm.latency as Record<string, unknown>) || {};
            const pmLatencyPercentiles = (pmLatency.percentiles as Record<string, unknown>) || {};
            const pmLatencyBasic = (pmLatency.basic as Record<string, unknown>) || {};
            const pmQueries = (pm.queries as Record<string, unknown>) || {};
            const pmDuration = (pm.duration as Record<string, unknown>) || {};
            const stats = (test.statistics as Record<string, unknown>) || {};
            const percentiles = (stats.percentiles as Record<string, number>) || {};
            const basic = (stats.basic as Record<string, number>) || {};

            const baseRow: CsvRow = [
                test.testName as string,
                (pm.distributionStrategy as string) || (pm.strategy as string) || '-',
                (pm.threadCount as number) || '-',
                (pm.totalExecutionTime as number) || (pmDuration.total as number) || '-',
                (exec.totalQueries as number) || (pmQueries.total as number) || '-',
                (exec.successCount as number) || (pmQueries.completed as number) || '-',
                (exec.failureCount as number) || (pmQueries.failed as number) || '-',
                (exec.successRate as string) || (pmQueries.successRate as string) || '-',
                (qps.value as number) || (pmThroughput.qps as number) || '-',
                (qps.effectiveQps as number) || (pmThroughput.effectiveQps as number) || '-',
                (qps.grade as string) || (pmThroughput.grade as string) || '-',
                percentiles.p50 || (pmLatencyPercentiles.p50 as number) || '-',
                percentiles.p95 || (pmLatencyPercentiles.p95 as number) || '-',
                percentiles.p99 || (pmLatencyPercentiles.p99 as number) || '-',
                basic.mean || (pmLatencyBasic.mean as number) || '-',
                (latency.grade as string) || (pmLatency.grade as string) || '-',
                (throughput.grade as string) || (pmThroughput.grade as string) || '-',
                (test.performanceGrade as string) || (stats.grade as string) || '-'
            ];

            const perFile = (pm.perFile as Record<string, Record<string, unknown>>) || {};
            const fileEntries = Object.entries(perFile);
            if (fileEntries.length > 0) {
                fileEntries.forEach(([fileName, fileStats]) => {
                    const fileLatency = (fileStats.latency as Record<string, number | undefined>) || {};
                    rows.push([
                        ...baseRow,
                        fileName,
                        fileStats.completed as number,
                        fileStats.failed as number,
                        fileStats.successRate as string,
                        fileLatency.mean ?? '-',
                        fileLatency.p50 ?? '-',
                        fileLatency.p95 ?? '-',
                        fileLatency.p99 ?? '-',
                        fileLatency.min ?? '-',
                        fileLatency.max ?? '-'
                    ]);
                });
            } else {
                rows.push([...baseRow, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
            }
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 5. Generate recommendations CSV
     */
    async generateRecommendationsCSV(filePath: string): Promise<string> {
        const headers: CsvRow = [
            'カテゴリ',
            '重要度',
            'タイトル',
            '説明',
            '対応策'
        ];

        const rows: CsvRow[] = [headers];
        const recommendations = (this.report.recommendations as Record<string, unknown>[]) || [];

        if (recommendations.length > 0) {
            for (const rec of recommendations) {
                const actions = (rec.actions as string[]) ? (rec.actions as string[]).join('; ') : '';

                rows.push([
                    (rec.category as string) || '-',
                    (rec.priority as string) || '-',
                    (rec.title as string) || '-',
                    (rec.description as string) || '-',
                    actions
                ]);
            }
        } else {
            rows.push(['情報なし', '-', '-', '-', '-']);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 6. Generate warmup analysis CSV
     */
    async generateWarmupAnalysisCSV(filePath: string): Promise<string> {
        const headers: CsvRow = [
            'テスト名',
            'ウォームアップ回数',
            '成功数',
            '失敗数',
            '総実行時間(ms)',
            '平均実行時間(ms)',
            'キャッシュ効果評価',
            '改善率(%)',
            '前半平均(ms)',
            '後半平均(ms)',
            'トレンド',
            '推奨事項'
        ];

        const rows: CsvRow[] = [headers];
        const details = (this.report.details as Record<string, unknown>[]) || [];

        for (const test of details) {
            const warmup = (test.warmup || test.warmupEffectiveness) as Record<string, unknown> | undefined;
            if (!warmup) continue;

            const effectiveness = (warmup.cacheEffectiveness || warmup) as Record<string, unknown>;
            const trend = (effectiveness.trend as Record<string, unknown>) || {};

            rows.push([
                test.testName as string,
                (warmup.count as number) || '-',
                (warmup.successCount as number) || '-',
                (warmup.failureCount as number) || '-',
                (warmup.totalDuration as number) || '-',
                (warmup.averageDuration as number) || '-',
                (effectiveness.effectivenessRating as string) || '-',
                (effectiveness.improvementPercentage as number) || '-',
                (effectiveness.firstHalfAvg as number) || '-',
                (effectiveness.secondHalfAvg as number) || '-',
                (trend.type as string) || '-',
                (effectiveness.recommendation as string) || '-'
            ]);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * Convert an array to CSV format string
     * @param array - 2D array
     * @returns CSV string
     */
    arrayToCSV(array: CsvRow[]): string {
        return array.map(row =>
            row.map(cell => this.escapeCSVCell(cell)).join(',')
        ).join('\n');
    }

    /**
     * Escape a CSV cell value
     * @param cell - Cell value
     * @returns Escaped string
     */
    escapeCSVCell(cell: CsvCell): string {
        if (cell === null || cell === undefined) {
            return '';
        }

        const str = String(cell);

        // Wrap in double quotes if it contains commas, newlines, or double quotes
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
        }

        return str;
    }

    /**
     * Clean up a query string
     * @param query - Query string
     * @returns Cleaned query
     */
    cleanQuery(query: string | undefined): string {
        if (!query) return '-';

        // Collapse multiple lines into one
        return query
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200); // Truncate if too long
    }
}
