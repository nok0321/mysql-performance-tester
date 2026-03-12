/**
 * Parallel Command - 並列負荷テスト実行コマンド
 */

import { createDbConfig } from '../../lib/config/database-configuration.js';
import { createTestConfig } from '../../lib/config/test-configuration.js';
import { ParallelPerformanceTester } from '../../lib/testers/parallel-tester.js';
import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { JsonExporter } from '../../lib/reports/exporters/json-exporter.js';
import { MarkdownExporter } from '../../lib/reports/exporters/markdown-exporter.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Parallel コマンド実行
 */
export async function parallelCommand(options) {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - 並列負荷テスト'.padStart(40));
    console.log('='.repeat(60));

    // 設定の作成
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

    const testResults = [];
    let parallelTester = null;

    try {
        // 並列テスターの初期化
        parallelTester = new ParallelPerformanceTester(dbConfig, testConfig);
        await parallelTester.initialize();

        // 並列テスト実行
        const parallelDir = testConfig.parallelDirectory || './parallel';
        const results = await parallelTester.executeParallelTestsFromFiles(parallelDir);

        if (results) {
            // 並列テストの結果を testResults に追加
            Object.values(results).forEach(result => {
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

        // 結果の保存
        const resultDir = await saveResults(testResults, testConfig);

        // レポート生成
        if (resultDir && testConfig.generateReport) {
            await generateReport(testResults, testConfig, resultDir);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ 並列負荷テストが完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ エラーが発生しました:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // クリーンアップ
        if (parallelTester) {
            await parallelTester.cleanup();
        }
    }
}

/**
 * 結果の保存
 */
async function saveResults(testResults, config) {
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
    } catch (error) {
        console.error(`❌ 結果保存エラー: ${error.message}`);
        return null;
    }
}

/**
 * レポート生成
 */
async function generateReport(testResults, config, resultDir) {
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
    } catch (error) {
        console.error(`❌ レポート生成エラー: ${error.message}`);
        console.error(error.stack);
    }
}
