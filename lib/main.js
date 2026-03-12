/**
 * MySQL Performance Tester - メイン実行モジュール
 * すべての機能を統合した実行フロー（SQLファイルベース）
 */

import { MySQLPerformanceTester } from './testers/single-tester.js';
import { ParallelPerformanceTester } from './testers/parallel-tester.js';
import { ReportGenerator } from './reports/report-generator.js';
import { JsonExporter, MarkdownExporter, HtmlExporter, CsvExporter } from './reports/exporters/index.js';
import { generateTestName } from './utils/formatter.js';
import { promises as fs } from 'fs';
import path from 'path';

// ========== テスト実行ランナー ==========
export class MainTestRunner {
    /**
     * @param {Object} dbConfig   - createDbConfig() が返すプレーンオブジェクト
     * @param {Object} testConfig - createTestConfig() が返すプレーンオブジェクト
     * @param {Object} [deps={}]  - 依存の注入（テスト・カスタマイズ用）
     *   deps.tester                  - { executeTestWithWarmup(name, query), cleanup(), printFileManagerSummary() } を実装するインスタンス
     *   deps.parallelTester          - { initialize(), executeParallelTests(name, query), executeParallelTestsFromFiles(dir), cleanup() } を実装するインスタンス
     *   deps.reportGeneratorFactory  - (testResults, config) => ReportGenerator（省略時はデフォルト実装）
     *   deps.exporters               - Exporter[] （省略時は Json/Markdown/Html/Csv の4種）
     */
    constructor(dbConfig, testConfig, deps = {}) {
        this.dbConfig       = dbConfig;
        this.testConfig     = testConfig;
        this.tester         = deps.tester         ?? null;
        this.parallelTester = deps.parallelTester ?? null;
        this._reportGeneratorFactory = deps.reportGeneratorFactory ?? null;
        this._exporters              = deps.exporters              ?? null;
        this.testResults    = [];
    }

    /**
     * テスターの初期化
     * - deps.tester が注入されていない場合は MySQLPerformanceTester を内部生成して initialize() する
     */
    async initialize() {
        if (!this.tester) {
            this.tester = new MySQLPerformanceTester(this.dbConfig, this.testConfig);
        }
        await this.tester.initialize();
        return this;
    }

    /**
     * SQLファイルからテストを実行
     */
    async runTestsFromSQLFiles() {
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
                .sort(); // ファイル名順にソート

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

                // テスト名の生成（元の仕様に合わせる）
                const testName = this.generateTestName(file);

                console.log(`\n${'─'.repeat(60)}`);
                console.log(`実行中: ${file} → ${testName}`);
                console.log(`${'─'.repeat(60)}`);

                try {
                    const result = await this.tester.executeTestWithWarmup(testName, query);
                    this.testResults.push(result);
                } catch (error) {
                    console.error(`❌ エラー in ${file}:`, error.message);
                }
            }

            return this.testResults;

        } catch (error) {
            console.error(`❌ SQLファイル読み込みエラー: ${error.message}`);
            console.log(`確認してください: ${this.testConfig.sqlDirectory}`);
            return [];
        }
    }

    /**
     * テスト名の生成
     * @see generateTestName in lib/utils/formatter.js
     */
    generateTestName(filename) {
        return generateTestName(filename);
    }

    /**
     * parallelTester を未初期化ならここで生成・初期化する（内部ヘルパー）
     */
    async _ensureParallelTester() {
        if (!this.parallelTester) {
            this.parallelTester = new ParallelPerformanceTester(this.dbConfig, this.testConfig);
            await this.parallelTester.initialize();
        }
    }

    /**
     * 並列負荷テストを実行（単一クエリ用 - 後方互換性）
     */
    async runParallelTests(query, testName = '並列負荷テスト') {
        console.log('\n' + '='.repeat(60));
        console.log('並列負荷テスト開始'.padStart(40));
        console.log('='.repeat(60));

        await this._ensureParallelTester();

        const results = await this.parallelTester.executeParallelTests(testName, query);
        return results;
    }

    /**
     * 並列負荷テストをファイルから実行（元の仕様）
     */
    async runParallelTestsFromFiles() {
        console.log('\n' + '='.repeat(60));
        console.log('並列負荷テスト（複数SQLファイル）'.padStart(40));
        console.log('='.repeat(60));

        await this._ensureParallelTester();

        const parallelDir = this.testConfig.parallelDirectory || './parallel';
        const results = await this.parallelTester.executeParallelTestsFromFiles(parallelDir);

        if (results) {
            // 並列テストの結果を testResults に追加
            Object.values(results).forEach(result => {
                if (result.metrics) {
                    this.testResults.push({
                        testName: `並列負荷テスト: ${result.strategy}`,
                        query: '(複数SQLファイルによる並列実行)', // クエリ情報を追加
                        parallelResults: result,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }

        return results;
    }

    /**
     * テスト結果の保存
     */
    async saveResults() {
        console.log('\n' + '='.repeat(60));
        console.log('結果保存中...'.padStart(40));
        console.log('='.repeat(60));

        const resultDir = this.testConfig.resultDirectory;

        try {
            await fs.mkdir(resultDir, { recursive: true });

            // 生データ保存
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
            console.error(`❌ 結果保存エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * レポート生成
     */
    async generateReport(resultDir) {
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
                : new ReportGenerator(this.testResults, this.testConfig);
            await generator.analyze();

            // エクスポーターの準備
            const exporters = this._exporters ?? [
                new JsonExporter(),
                new MarkdownExporter(),
                new HtmlExporter(),
                new CsvExporter()
            ];

            const exportedFiles = await generator.exportReports(
                this.testConfig.resultDirectory,
                exporters
            );

            console.log('\n✓ レポート生成完了');
            console.log(`\n📁 出力ディレクトリ: ${this.testConfig.resultDirectory}`);
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

    /**
     * クリーンアップ
     */
    async cleanup() {
        console.log('\n' + '='.repeat(60));
        console.log('クリーンアップ中...'.padStart(40));
        console.log('='.repeat(60));

        if (this.tester) {
            // FileManagerのサマリーを表示（deps.tester 注入時はメソッドが存在しない場合がある）
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

