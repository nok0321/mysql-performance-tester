/**
 * MySQL Performance Tester - Main execution module
 * Integrates all features into an execution flow (SQL file based)
 */

import { MySQLPerformanceTester } from './testers/single-tester.js';
import { ParallelPerformanceTester } from './testers/parallel-tester.js';
import { ReportGenerator } from './reports/report-generator.js';
import { JsonExporter, MarkdownExporter, HtmlExporter, CsvExporter } from './reports/exporters/index.js';
import { generateTestName } from './utils/formatter.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { DbConfig, TestConfig } from './types/index.js';
import type { TestResult } from './models/test-result.js';

/** Minimal tester interface for dependency injection */
interface TesterLike {
    initialize(): Promise<unknown>;
    executeTestWithWarmup(name: string, query: string): Promise<TestResult>;
    cleanup(): Promise<void>;
    printFileManagerSummary?(): void;
}

/** Minimal parallel tester interface for dependency injection */
interface ParallelTesterLike {
    initialize(): Promise<unknown>;
    executeParallelTests(name: string, query: string): Promise<unknown>;
    executeParallelTestsFromFiles(dir: string): Promise<Record<string, unknown> | null>;
    cleanup(): Promise<void>;
}

/** Exporter interface */
interface Exporter {
    export(reportData: unknown, outputDir: string): Promise<string>;
    name?: string;
}

/** Report generator factory type */
type ReportGeneratorFactory = (testResults: unknown[], config: TestConfig) => ReportGenerator;

/** Dependency injection options */
interface MainTestRunnerDeps {
    tester?: TesterLike;
    parallelTester?: ParallelTesterLike;
    reportGeneratorFactory?: ReportGeneratorFactory;
    exporters?: Exporter[];
}

/** Parallel result entry stored in testResults */
interface ParallelResultEntry {
    testName: string;
    query: string;
    parallelResults: unknown;
    timestamp: string;
}

// ========== Test execution runner ==========
export class MainTestRunner {
    private dbConfig: DbConfig;
    private testConfig: TestConfig;
    private tester: TesterLike | null;
    private parallelTester: ParallelTesterLike | null;
    private _reportGeneratorFactory: ReportGeneratorFactory | null;
    private _exporters: Exporter[] | null;
    private testResults: (TestResult | ParallelResultEntry)[];

    constructor(dbConfig: DbConfig, testConfig: TestConfig, deps: MainTestRunnerDeps = {}) {
        this.dbConfig       = dbConfig;
        this.testConfig     = testConfig;
        this.tester         = deps.tester         ?? null;
        this.parallelTester = deps.parallelTester ?? null;
        this._reportGeneratorFactory = deps.reportGeneratorFactory ?? null;
        this._exporters              = deps.exporters              ?? null;
        this.testResults    = [];
    }

    /**
     * Initialize the tester.
     * If deps.tester is not injected, creates and initializes a MySQLPerformanceTester internally.
     */
    async initialize(): Promise<MainTestRunner> {
        if (!this.tester) {
            this.tester = new MySQLPerformanceTester(this.dbConfig, this.testConfig);
        }
        await this.tester.initialize();
        return this;
    }

    /**
     * Run tests from SQL files
     */
    async runTestsFromSQLFiles(): Promise<(TestResult | ParallelResultEntry)[]> {
        console.log('\n' + '='.repeat(60));
        console.log('SQLファイルベーステスト開始'.padStart(40));
        console.log('='.repeat(60));

        if (!this.tester) {
            throw new Error(
                'MainTestRunner: tester が設定されていません。' +
                'initialize() を呼び出すか、コンストラクタの deps.tester に渡してください。'
            );
        }

        try {
            const sqlDir = this.testConfig.sqlDirectory;
            await fs.access(sqlDir);

            const files = await fs.readdir(sqlDir);
            const sqlFiles = files
                .filter(f => f.endsWith('.sql'))
                .sort(); // Sort by filename

            console.log(`\n📁 SQLディレクトリ: ${sqlDir}`);
            console.log(`📄 検出されたSQLファイル: ${sqlFiles.length}件`);
            sqlFiles.forEach(file => console.log(`   - ${file}`));

            if (sqlFiles.length === 0) {
                console.log('\n⚠ SQLファイルが見つかりませんでした');
                console.log(`ヒント: ${sqlDir} ディレクトリに.sqlファイルを配置してください`);
                return [];
            }

            for (const file of sqlFiles) {
                const filePath = path.join(sqlDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const query = content.trim();

                // Generate test name (matching original spec)
                const testName = this.generateTestName(file);

                console.log(`\n${'─'.repeat(60)}`);
                console.log(`実行中: ${file} → ${testName}`);
                console.log(`${'─'.repeat(60)}`);

                try {
                    const result = await this.tester.executeTestWithWarmup(testName, query);
                    this.testResults.push(result);
                } catch (error) {
                    console.error(`❌ Error in ${file}:`, (error as Error).message);
                }
            }

            return this.testResults;

        } catch (error) {
            console.error(`❌ SQL file read error: ${(error as Error).message}`);
            console.log(`確認してください: ${this.testConfig.sqlDirectory}`);
            return [];
        }
    }

    /**
     * Generate a test name from filename
     * @see generateTestName in lib/utils/formatter.js
     */
    generateTestName(filename: string): string {
        return generateTestName(filename);
    }

    /**
     * Ensure parallel tester is initialized (internal helper)
     */
    private async _ensureParallelTester(): Promise<void> {
        if (!this.parallelTester) {
            this.parallelTester = new ParallelPerformanceTester(this.dbConfig, this.testConfig);
            await this.parallelTester.initialize();
        }
    }

    /**
     * Run parallel load tests (single query - backward compatibility)
     */
    async runParallelTests(query: string, testName: string = '並列負荷テスト'): Promise<unknown> {
        console.log('\n' + '='.repeat(60));
        console.log('並列負荷テスト開始'.padStart(40));
        console.log('='.repeat(60));

        await this._ensureParallelTester();

        const results = await this.parallelTester!.executeParallelTests(testName, query);
        return results;
    }

    /**
     * Run parallel load tests from files (original spec)
     */
    async runParallelTestsFromFiles(): Promise<Record<string, unknown> | null> {
        console.log('\n' + '='.repeat(60));
        console.log('並列負荷テスト（複数SQLファイル）'.padStart(40));
        console.log('='.repeat(60));

        await this._ensureParallelTester();

        const parallelDir = this.testConfig.parallelDirectory || './parallel';
        const results = await this.parallelTester!.executeParallelTestsFromFiles(parallelDir);

        if (results) {
            // Add parallel test results to testResults
            Object.values(results).forEach(result => {
                const r = result as Record<string, unknown>;
                if (r.metrics) {
                    this.testResults.push({
                        testName: `並列負荷テスト: ${r.strategy as string}`,
                        query: '(複数SQLファイルによる並列実行)',
                        parallelResults: r,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }

        return results;
    }

    /**
     * Save test results
     */
    async saveResults(): Promise<string | null> {
        console.log('\n' + '='.repeat(60));
        console.log('結果保存中...'.padStart(40));
        console.log('='.repeat(60));

        const resultDir = this.testConfig.resultDirectory;

        try {
            await fs.mkdir(resultDir, { recursive: true });

            // Save raw data
            const resultsPath = path.join(resultDir, 'results.json');
            await fs.writeFile(
                resultsPath,
                JSON.stringify({
                    config: this.testConfig,
                    results: this.testResults
                }, null, 2)
            );

            console.log(`\n✓ 結果を保存しました: ${resultsPath}`);
            console.log(`✓ 結果ディレクトリ: ${resultDir}`);

            return resultDir;
        } catch (error) {
            console.error(`❌ Result save error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Generate reports
     */
    async generateReport(_resultDir?: string): Promise<Record<string, string> | undefined> {
        if (!this.testConfig.generateReport) {
            console.log('\n⚠ レポート生成はスキップされました');
            return;
        }

        console.log('\n' + '='.repeat(60));
        console.log('レポート生成中...'.padStart(40));
        console.log('='.repeat(60));

        try {
            const generator = this._reportGeneratorFactory
                ? this._reportGeneratorFactory(this.testResults, this.testConfig)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : new ReportGenerator(this.testResults as any[], this.testConfig as unknown as Record<string, unknown>);
            await generator.analyze();

            // Prepare exporters
            const exporters = this._exporters ?? [
                new JsonExporter(),
                new MarkdownExporter(),
                new HtmlExporter(),
                new CsvExporter()
            ];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exportedFiles = await (generator as any).exportReports(
                this.testConfig.resultDirectory,
                exporters
            );

            console.log('\n✓ レポート生成完了');
            console.log(`\n📁 出力ディレクトリ: ${this.testConfig.resultDirectory}`);
            console.log(`\n生成されたファイル:`);

            for (const [exporterName, filePath] of Object.entries(exportedFiles as Record<string, string>)) {
                console.log(`  - ${exporterName}: ${filePath}`);
            }

            return exportedFiles as Record<string, string>;
        } catch (error) {
            console.error(`❌ Report generation error: ${(error as Error).message}`);
            console.error((error as Error).stack);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        console.log('\n' + '='.repeat(60));
        console.log('クリーンアップ中...'.padStart(40));
        console.log('='.repeat(60));

        if (this.tester) {
            // Show FileManager summary (method may not exist when deps.tester is injected)
            if (typeof this.tester.printFileManagerSummary === 'function') {
                this.tester.printFileManagerSummary();
            }

            await this.tester.cleanup();
        }

        if (this.parallelTester) {
            await this.parallelTester.cleanup();
        }

        console.log('✓ クリーンアップ完了');
    }
}
