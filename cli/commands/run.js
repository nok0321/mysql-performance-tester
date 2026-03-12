/**
 * Run Command - 順次テスト実行コマンド
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

/**
 * Run コマンド実行
 */
export async function runCommand(options) {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - 順次テスト実行'.padStart(40));
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
        skipParallelTests:         options.skipParallel,
        resultDirectory:           options.outputDir || undefined,
    });

    if (options.verbose) {
        console.log('\n設定情報:');
        console.log(JSON.stringify({ dbConfig: { ...dbConfig, password: '***' }, testConfig }, null, 2));
    }

    const testResults = [];
    let tester = null;
    let parallelTester = null;

    try {
        // テスターの初期化
        tester = new MySQLPerformanceTester(dbConfig, testConfig);
        await tester.initialize();

        // SQLファイルからテスト実行
        const sqlResults = await runTestsFromSQLFiles(tester, testConfig);
        testResults.push(...sqlResults);

        // 並列テストも実行（skipParallelがfalseの場合）
        if (!options.skipParallel) {
            try {
                parallelTester = new ParallelPerformanceTester(dbConfig, testConfig);
                await parallelTester.initialize();

                const parallelResults = await runParallelTestsFromFiles(
                    parallelTester,
                    testConfig,
                    testResults
                );
            } catch (error) {
                console.log('\n⚠️ 並列テストをスキップ:', error.message);
            }
        }

        // 結果の保存
        const resultDir = await saveResults(testResults, testConfig);

        // レポート生成
        if (resultDir && testConfig.generateReport) {
            await generateReport(testResults, testConfig, resultDir);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ すべてのテストが完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ エラーが発生しました:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // クリーンアップ
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
 * SQLファイルからテストを実行
 */
async function runTestsFromSQLFiles(tester, config) {
    console.log('\n' + '='.repeat(60));
    console.log('SQLファイルベーステスト開始'.padStart(40));
    console.log('='.repeat(60));

    const testResults = [];

    try {
        const sqlDir = config.sqlDirectory;
        await fs.access(sqlDir);

        const files = await fs.readdir(sqlDir);
        const sqlFiles = files
            .filter(f => f.endsWith('.sql'))
            .sort();

        console.log(`\n📁 SQLディレクトリ: ${sqlDir}`);
        console.log(`📄 検出されたSQLファイル: ${sqlFiles.length}件`);
        sqlFiles.forEach(file => console.log(`   - ${file}`));

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
            } catch (error) {
                console.error(`❌ エラー in ${file}:`, error.message);
            }
        }

        return testResults;

    } catch (error) {
        console.error(`❌ SQLファイル読み込みエラー: ${error.message}`);
        console.log(`確認してください: ${config.sqlDirectory}`);
        return testResults;
    }
}

/**
 * 並列テストをファイルから実行
 */
async function runParallelTestsFromFiles(parallelTester, config, testResults) {
    console.log('\n' + '='.repeat(60));
    console.log('並列負荷テスト（複数SQLファイル）'.padStart(40));
    console.log('='.repeat(60));

    const parallelDir = config.parallelDirectory || './parallel';
    const results = await parallelTester.executeParallelTestsFromFiles(parallelDir);

    if (results) {
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

    return results;
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
