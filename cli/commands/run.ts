/**
 * Run Command - Sequential test execution command
 */

import { createDbConfig } from '../../lib/config/database-configuration.js';
import { createTestConfig } from '../../lib/config/test-configuration.js';
import { MySQLPerformanceTester } from '../../lib/testers/single-tester.js';
import { ParallelPerformanceTester } from '../../lib/testers/parallel-tester.js';
import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { JsonExporter } from '../../lib/reports/exporters/json-exporter.js';
import { MarkdownExporter } from '../../lib/reports/exporters/markdown-exporter.js';
import { generateTestName } from '../../lib/utils/formatter.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { ParsedOptions } from '../options.js';
import type { TestConfig } from '../../lib/types/index.js';
import type { TestResult } from '../../lib/models/test-result.js';

/** Entry for a parallel test result stored alongside sequential results */
interface ParallelResultEntry {
    testName: string;
    query: string;
    parallelResults: unknown;
    timestamp: string;
}

type CombinedResult = TestResult | ParallelResultEntry;

/**
 * Execute the run command
 */
export async function runCommand(options: ParsedOptions): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - 順次テスト実行'.padStart(40));
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
        skipParallelTests:         options.skipParallel,
        resultDirectory:           options.outputDir || undefined,
    });

    if (options.verbose) {
        console.log('\n設定情報:');
        console.log(JSON.stringify({ dbConfig: { ...dbConfig, password: '***' }, testConfig }, null, 2));
    }

    const testResults: CombinedResult[] = [];
    let tester: MySQLPerformanceTester | null = null;
    let parallelTester: ParallelPerformanceTester | null = null;

    try {
        // Initialize tester
        tester = new MySQLPerformanceTester(dbConfig, testConfig);
        await tester.initialize();

        // Execute tests from SQL files
        const sqlResults = await runTestsFromSQLFiles(tester, testConfig);
        testResults.push(...sqlResults);

        // Run parallel tests as well (when skipParallel is false)
        if (!options.skipParallel) {
            try {
                parallelTester = new ParallelPerformanceTester(dbConfig, testConfig);
                await parallelTester.initialize();

                await runParallelTestsFromFiles(
                    parallelTester,
                    testConfig,
                    testResults
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.log('\n⚠️ 並列テストをスキップ:', message);
            }
        }

        // Save results
        const resultDir = await saveResults(testResults, testConfig);

        // Generate report
        if (resultDir && testConfig.generateReport) {
            await generateReport(testResults, testConfig as unknown as Record<string, unknown>, resultDir);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ すべてのテストが完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error: unknown) {
        console.error('\n❌ エラーが発生しました:', error);
        if (error instanceof Error) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        // Cleanup
        if (tester) {
            tester.printFileManagerSummary();
            await tester.cleanup();
        }
        if (parallelTester) {
            await parallelTester.cleanup();
        }
    }
}

/**
 * Execute tests from SQL files
 */
async function runTestsFromSQLFiles(tester: MySQLPerformanceTester, config: TestConfig): Promise<TestResult[]> {
    console.log('\n' + '='.repeat(60));
    console.log('SQLファイルベーステスト開始'.padStart(40));
    console.log('='.repeat(60));

    const testResults: TestResult[] = [];

    try {
        const sqlDir = config.sqlDirectory;
        await fs.access(sqlDir);

        const files = await fs.readdir(sqlDir);
        const sqlFiles = files
            .filter((f: string) => f.endsWith('.sql'))
            .sort();

        console.log(`\n📁 SQLディレクトリ: ${sqlDir}`);
        console.log(`📄 検出されたSQLファイル: ${sqlFiles.length}件`);
        sqlFiles.forEach((file: string) => console.log(`   - ${file}`));

        if (sqlFiles.length === 0) {
            console.log('\n⚠ SQLファイルが見つかりませんでした');
            console.log(`ヒント: ${sqlDir} ディレクトリに.sqlファイルを配置してください`);
            return testResults;
        }

        for (const file of sqlFiles) {
            const filePath = path.join(sqlDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const query = content.trim();

            const testName = generateTestName(file);

            console.log(`\n${'─'.repeat(60)}`);
            console.log(`実行中: ${file} → ${testName}`);
            console.log(`${'─'.repeat(60)}`);

            try {
                const result = await tester.executeTestWithWarmup(testName, query);
                testResults.push(result);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`❌ エラー in ${file}:`, message);
            }
        }

        return testResults;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ SQLファイル読み込みエラー: ${message}`);
        console.log(`確認してください: ${config.sqlDirectory}`);
        return testResults;
    }
}

/**
 * Execute parallel tests from files
 */
async function runParallelTestsFromFiles(
    parallelTester: ParallelPerformanceTester,
    config: TestConfig,
    testResults: CombinedResult[]
): Promise<Record<string, unknown> | null> {
    console.log('\n' + '='.repeat(60));
    console.log('並列負荷テスト（複数SQLファイル）'.padStart(40));
    console.log('='.repeat(60));

    const parallelDir = config.parallelDirectory || './parallel';
    const results = await parallelTester.executeParallelTestsFromFiles(parallelDir);

    if (results) {
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

    return results as Record<string, unknown> | null;
}


/**
 * Save results to disk
 */
async function saveResults(testResults: CombinedResult[], config: TestConfig): Promise<string | null> {
    console.log('\n' + '='.repeat(60));
    console.log('結果保存中...'.padStart(40));
    console.log('='.repeat(60));

    const resultDir = config.resultDirectory;

    try {
        await fs.mkdir(resultDir, { recursive: true });

        const resultsPath = path.join(resultDir, 'results.json');
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
    testResults: CombinedResult[],
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
