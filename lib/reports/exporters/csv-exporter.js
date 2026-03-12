/**
 * CSVエクスポーター
 * レポートデータをExcelでの分析に適したCSV形式でエクスポート
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

/**
 * CSVエクスポータークラス
 */
export class CsvExporter extends BaseExporter {
    /**
     * コンストラクタ
     */
    constructor(analysisReport) {
        super();
        this.report = analysisReport;
    }

    /**
     * レポートをCSVファイルとしてエクスポート
     */
    async export(reportData, outputDir) {
        this.report = reportData;
        return await this.generateAllReports(outputDir);
    }

    /**
     * すべてのCSVレポートを生成
     * @param {string} outputDir - 出力ディレクトリ
     * @returns {Object} 生成されたファイルのパス
     */
    async generateAllReports(outputDir) {
        // 出力ディレクトリの作成
        await fs.mkdir(outputDir, { recursive: true });

        const files = {};

        // 1. サマリーCSV
        files.summary = await this.generateSummaryCSV(
            path.join(outputDir, 'summary.csv')
        );

        // 2. テスト概要CSV
        files.testsOverview = await this.generateTestsOverviewCSV(
            path.join(outputDir, 'tests_overview.csv')
        );

        // 3. 詳細統計CSV
        files.detailedStats = await this.generateDetailedStatisticsCSV(
            path.join(outputDir, 'detailed_statistics.csv')
        );

        // 4. 並列メトリクスCSV
        files.parallelMetrics = await this.generateParallelMetricsCSV(
            path.join(outputDir, 'parallel_metrics.csv')
        );

        // 5. 推奨事項CSV
        files.recommendations = await this.generateRecommendationsCSV(
            path.join(outputDir, 'recommendations.csv')
        );

        // 6. ウォームアップ分析CSV
        files.warmup = await this.generateWarmupAnalysisCSV(
            path.join(outputDir, 'warmup_analysis.csv')
        );

        return files;
    }

    /**
     * 1. サマリーCSV生成
     */
    async generateSummaryCSV(filePath) {
        const summary = this.report.summary;
        const config = this.report.metadata.configuration || {};

        const rows = [
            ['項目', '値'],
            ['生成日時', this.report.metadata.generatedAt],
            ['総テスト数', summary.testCount.total],
            ['成功', summary.testCount.successful],
            ['失敗', summary.testCount.failed],
            ['総合評価', summary.performanceGrade],
            ['総クエリ数', summary.overallMetrics.totalQueries],
            ['平均P95 (ms)', summary.overallMetrics.averageP95],
            ['最大QPS', summary.overallMetrics.maxQPS],
            ['平均QPS', summary.overallMetrics.avgQPS],
            ['', ''],
            ['データベース情報', ''],
            ['ホスト', config.database?.host || 'N/A'],
            ['ポート', config.database?.port || 'N/A'],
            ['データベース名', config.database?.database || 'N/A'],
            ['', ''],
            ['テスト設定', ''],
            ['テスト反復回数', config.test?.testIterations || 'N/A'],
            ['並列スレッド数', config.test?.parallelThreads || 'N/A'],
            ['ウォームアップ有効', config.test?.enableWarmup ? 'はい' : 'いいえ'],
            ['外れ値除外', config.test?.removeOutliers ? 'はい' : 'いいえ'],
            ['外れ値検出手法', config.test?.outlierMethod || 'N/A']
        ];

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 2. テスト概要CSV生成
     */
    async generateTestsOverviewCSV(filePath) {
        const headers = [
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

        const rows = [headers];

        for (const test of this.report.details) {
            const stats = test.statistics;
            if (!stats) continue;

            // 成功・失敗の計算
            let successCount, failureCount, successRate;
            if (test.parallelMetrics && test.parallelMetrics.execution) {
                successCount = test.parallelMetrics.execution.successCount;
                failureCount = test.parallelMetrics.execution.failureCount;
                successRate = test.parallelMetrics.execution.successRate;
            } else if (stats.count) {
                successCount = stats.count.included;
                failureCount = 0;
                successRate = 100;
            } else {
                successCount = '-';
                failureCount = '-';
                successRate = '-';
            }

            rows.push([
                test.testName,
                this.cleanQuery(test.query),
                test.timestamp,
                stats.count?.total || '-',
                successCount,
                failureCount,
                successRate,
                stats.basic?.mean || '-',
                stats.basic?.median || '-',
                stats.percentiles?.p95 || '-',
                stats.percentiles?.p99 || '-',
                stats.basic?.min || '-',
                stats.basic?.max || '-',
                stats.spread?.stdDev || '-',
                stats.spread?.cv || '-',
                stats.outliers?.count || 0,
                test.performanceGrade || stats.grade || '-'
            ]);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 3. 詳細統計CSV生成（パーセンタイル含む）
     */
    async generateDetailedStatisticsCSV(filePath) {
        const headers = [
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

        const rows = [headers];

        for (const test of this.report.details) {
            const stats = test.statistics;
            if (!stats) continue;

            const perc = stats.percentiles || {};
            const basic = stats.basic || {};
            const spread = stats.spread || {};
            const count = stats.count || {};

            rows.push([
                test.testName,
                count.total || '-',
                stats.outliers?.count || 0,
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
     * 4. 並列メトリクスCSV生成
     */
    async generateParallelMetricsCSV(filePath) {
        const headers = [
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

        const rows = [headers];

        for (const test of this.report.details) {
            if (!test.parallelMetrics) continue;

            const pm = test.parallelMetrics;
            const exec = pm.execution || {};
            const perf = pm.performance || {};
            const qps = perf.qps || {};
            const latency = perf.latency || {};
            const throughput = perf.throughput || {};
            const stats = test.statistics || {};
            const percentiles = stats.percentiles || {};
            const basic = stats.basic || {};

            const baseRow = [
                test.testName,
                pm.distributionStrategy || pm.strategy || '-',
                pm.threadCount || '-',
                pm.totalExecutionTime || pm.duration?.total || '-',
                exec.totalQueries || pm.queries?.total || '-',
                exec.successCount || pm.queries?.completed || '-',
                exec.failureCount || pm.queries?.failed || '-',
                exec.successRate || pm.queries?.successRate || '-',
                qps.value || pm.throughput?.qps || '-',
                qps.effectiveQps || pm.throughput?.effectiveQps || '-',
                qps.grade || pm.throughput?.grade || '-',
                percentiles.p50 || pm.latency?.percentiles?.p50 || '-',
                percentiles.p95 || pm.latency?.percentiles?.p95 || '-',
                percentiles.p99 || pm.latency?.percentiles?.p99 || '-',
                basic.mean || pm.latency?.basic?.mean || '-',
                latency.grade || pm.latency?.grade || '-',
                throughput.grade || pm.throughput?.grade || '-',
                test.performanceGrade || stats.grade || '-'
            ];

            const fileEntries = Object.entries(pm.perFile || {});
            if (fileEntries.length > 0) {
                fileEntries.forEach(([fileName, fs]) => {
                    rows.push([
                        ...baseRow,
                        fileName,
                        fs.completed,
                        fs.failed,
                        fs.successRate,
                        fs.latency?.mean ?? '-',
                        fs.latency?.p50 ?? '-',
                        fs.latency?.p95 ?? '-',
                        fs.latency?.p99 ?? '-',
                        fs.latency?.min ?? '-',
                        fs.latency?.max ?? '-'
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
     * 5. 推奨事項CSV生成
     */
    async generateRecommendationsCSV(filePath) {
        const headers = [
            'カテゴリ',
            '重要度',
            'タイトル',
            '説明',
            '対応策'
        ];

        const rows = [headers];

        if (this.report.recommendations && this.report.recommendations.length > 0) {
            for (const rec of this.report.recommendations) {
                const actions = rec.actions ? rec.actions.join('; ') : '';

                rows.push([
                    rec.category || '-',
                    rec.priority || '-',
                    rec.title || '-',
                    rec.description || '-',
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
     * 6. ウォームアップ分析CSV生成
     */
    async generateWarmupAnalysisCSV(filePath) {
        const headers = [
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

        const rows = [headers];

        for (const test of this.report.details) {
            const warmup = test.warmup || test.warmupEffectiveness;
            if (!warmup) continue;

            const effectiveness = warmup.cacheEffectiveness || warmup;

            rows.push([
                test.testName,
                warmup.count || '-',
                warmup.successCount || '-',
                warmup.failureCount || '-',
                warmup.totalDuration || '-',
                warmup.averageDuration || '-',
                effectiveness.effectivenessRating || '-',
                effectiveness.improvementPercentage || '-',
                effectiveness.firstHalfAvg || '-',
                effectiveness.secondHalfAvg || '-',
                effectiveness.trend?.type || '-',
                effectiveness.recommendation || '-'
            ]);
        }

        const csv = this.arrayToCSV(rows);
        await fs.writeFile(filePath, csv, 'utf8');

        return filePath;
    }

    /**
     * 配列をCSV形式の文字列に変換
     * @param {Array<Array>} array - 2次元配列
     * @returns {string} CSV文字列
     */
    arrayToCSV(array) {
        return array.map(row =>
            row.map(cell => this.escapeCSVCell(cell)).join(',')
        ).join('\n');
    }

    /**
     * CSVセルのエスケープ処理
     * @param {*} cell - セルの値
     * @returns {string} エスケープされた文字列
     */
    escapeCSVCell(cell) {
        if (cell === null || cell === undefined) {
            return '';
        }

        const str = String(cell);

        // カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
        }

        return str;
    }

    /**
     * クエリ文字列のクリーンアップ
     * @param {string} query - クエリ文字列
     * @returns {string} クリーンアップされたクエリ
     */
    cleanQuery(query) {
        if (!query) return '-';

        // 複数行を1行に
        return query
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200); // 長すぎる場合は切り詰め
    }
}
