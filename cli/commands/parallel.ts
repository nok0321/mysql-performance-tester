/**
 * Parallel Command - Parallel load test execution command
 */

import { createDbConfig } from '../../lib/config/database-configuration.js';
import { createTestConfig } from '../../lib/config/test-configuration.js';
import { ParallelPerformanceTester } from '../../lib/testers/parallel-tester.js';
import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { JsonExporter } from '../../lib/reports/exporters/json-exporter.js';
import { MarkdownExporter } from '../../lib/reports/exporters/markdown-exporter.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { ParsedOptions } from '../options.js';
import type { TestConfig } from '../../lib/types/index.js';

/** Entry for a parallel test result */
interface ParallelResultEntry {
    testName: string;
    query: string;
    parallelResults: unknown;
    timestamp: string;
}

/**
 * Execute the parallel command
 */
export async function parallelCommand(options: ParsedOptions): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - 並列負荷テスト'.padStart(40));
    console.log('='.repeat(60));

    // Build configuration
    const dbConfig = createDbConfig({
        host:     options.host,
        port:     options.port,
        user:     options.user,
        password: options.password,
        database: options.database,
        parallelThreads: options.threads,
    });

    const testConfig = createTestConfig({
        testIterations:            options.iterations,
        parallelThreads:           options.threads,
        sqlDirectory:              options.sqlDir,
        parallelDirectory:         options.parallelDir,
        enableWarmup:              options.warmup,
        warmupPercentage:          options.warmupPercentage,
        removeOutliers:            options.removeOutliers,
        outlierMethod:             options.outlierMethod,
        enableExplainAnalyze:      options.explainAnalyze,
        enablePerformanceSchema:   options.performanceSchema,
        enableOptimizerTrace:      options.optimizerTrace,
        enableBufferPoolMonitoring: options.bufferPoolMonitoring,
        generateReport:            options.generateReport,
        resultDirectory:           options.outputDir || undefined,
    });

    if (options.verbose) {
        console.log('\n設定情報:');
        console.log(JSON.stringify({ dbConfig: { ...dbConfig, password: '***' }, testConfig }, null, 2));
    }

    const testResults: ParallelResultEntry[] = [];
    let parallelTester: ParallelPerformanceTester | null = null;

    try {
        // Initialize parallel tester
        parallelTester = new ParallelPerformanceTester(dbConfig, testConfig);
        await parallelTester.initialize();

        // Execute parallel tests
        const parallelDir = testConfig.parallelDirectory || './parallel';
        const results = await parallelTester.executeParallelTestsFromFiles(parallelDir);

        if (results) {
            // Add parallel test results to testResults
            Object.values(results).forEach((result) => {
                if (result.metrics) {
                    testResults.push({
                        testName: `並列負荷テスト: ${result.strategy}`,
                        query: '(複数SQLファイルによる並列実行)',
                        parallelResults: result,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }

        // Save results
        const resultDir = await saveResults(testResults, testConfig);

        // Generate report
        if (resultDir && testConfig.generateReport) {
            await generateReport(testResults, testConfig as unknown as Record<string, unknown>, resultDir);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ 並列負荷テストが完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error: unknown) {
        console.error('\n❌ エラーが発生しました:', error);
        if (error instanceof Error) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        // Cleanup
        if (parallelTester) {
            await parallelTester.cleanup();
        }
    }
}

/**
 * Save results to disk
 */
async function saveResults(testResults: ParallelResultEntry[], config: TestConfig): Promise<string | null> {
    console.log('\n' + '='.repeat(60));
    console.log('結果保存中...'.padStart(40));
    console.log('='.repeat(60));

    const resultDir = config.resultDirectory;

    try {
        await fs.mkdir(resultDir, { recursive: true });

        const resultsPath = path.join(resultDir, 'parallel-results.json');
        await fs.writeFile(
            resultsPath,
            JSON.stringify({
                config: config,
                results: testResults
            }, null, 2)
        );

        console.log(`\n✓ 結果を保存しました: ${resultsPath}`);
        console.log(`✓ 結果ディレクトリ: ${resultDir}`);

        return resultDir;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ 結果保存エラー: ${message}`);
        return null;
    }
}

/**
 * Generate report
 */
async function generateReport(
    testResults: ParallelResultEntry[],
    config: Record<string, unknown>,
    resultDir: string
): Promise<Record<string, string> | undefined> {
    console.log('\n' + '='.repeat(60));
    console.log('レポート生成中...'.padStart(40));
    console.log('='.repeat(60));

    try {
        const generator = new ReportGenerator(testResults, config);
        await generator.analyze();

        const exporters = [
            new JsonExporter(),
            new MarkdownExporter()
        ];

        const exportedFiles = await generator.exportReports(resultDir, exporters);

        console.log('\n✓ レポート生成完了');
        console.log(`\n📁 出力ディレクトリ: ${resultDir}`);
        console.log(`\n生成されたファイル:`);

        for (const [exporterName, filePath] of Object.entries(exportedFiles)) {
            console.log(`  - ${exporterName}: ${filePath}`);
        }

        return exportedFiles;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`❌ レポート生成エラー: ${message}`);
        console.error(stack);
    }
}
