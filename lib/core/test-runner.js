/**
 * TestRunner - テスト実行ランナー
 *
 * SQLファイルベースのテスト実行を管理するクラス
  *
 * 機能:
 * - SQLファイルからテストを読み込んで実行
 * - 並列負荷テストの実行
 * - テスト結果の保存
 * - レポート生成
 * - クリーンアップ
 */

import fs from 'fs/promises';
import path from 'path';
import { generateTestName } from '../utils/formatter.js';

export class TestRunner {
    /**
     * TestRunnerを初期化
     *
     * @deprecated MainTestRunner（lib/main.js）を使用してください。
     *   このクラスは旧設定フォーマット（config.test.* / config.database.*）を前提とし、
     *   現在の createTestConfig() が返すフラット設定オブジェクトとは互換性がありません。
     *   今後のバージョンで削除される予定です。
     *
     * @param {Object} config - 統合設定オブジェクト（旧形式）
     * @param {Object} config.test - テスト設定
     * @param {Object} config.database - データベース設定
     */
    constructor(config) {
        console.warn(
            '[Deprecated] TestRunner は非推奨です。' +
            'MainTestRunner (lib/main.js) に移行してください。'
        );
        this.config = config;
        this.tester = null; // MySQLPerformanceTesterインスタンス
        this.parallelTester = null; // ParallelPerformanceTesterインスタンス
        this.testResults = [];
    }

    /**
     * SQLファイルからテストを実行
     *
     * @returns {Promise<Array>} テスト結果の配列
     */
    async runTestsFromSQLFiles() {
        console.log('\n' + '='.repeat(60));
        console.log('SQL File-Based Tests Starting'.padStart(40));
        console.log('='.repeat(60));

        if (!this.tester) {
            throw new Error(
                'TestRunner: tester が設定されていません。' +
                'setTester() を呼び出してから使用してください。'
            );
        }

        try {
            const sqlDir = this.config.test.sqlDirectory;
            await fs.access(sqlDir);

            const files = await fs.readdir(sqlDir);
            const sqlFiles = files
                .filter(f => f.endsWith('.sql'))
                .sort(); // ファイル名順にソート

            console.log(`\nSQL Directory: ${sqlDir}`);
            console.log(`SQL Files Found: ${sqlFiles.length}`);
            sqlFiles.forEach(file => console.log(`   - ${file}`));

            if (sqlFiles.length === 0) {
                console.log('\nNo SQL files found');
                console.log(`Hint: Place .sql files in ${sqlDir} directory`);
                return [];
            }

            for (const file of sqlFiles) {
                const filePath = path.join(sqlDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const query = content.trim();

                // テスト名の生成
                const testName = this.generateTestName(file);

                console.log(`\n${'-'.repeat(60)}`);
                console.log(`Executing: ${file} -> ${testName}`);
                console.log(`${'-'.repeat(60)}`);

                try {
                    const result = await this.tester.executeTestWithWarmup(testName, query);
                    this.testResults.push(result);
                } catch (error) {
                    console.error(`Error in ${file}:`, error.message);
                }
            }

            return this.testResults;

        } catch (error) {
            console.error(`SQL file loading error: ${error.message}`);
            console.log(`Please check: ${this.config.test.sqlDirectory}`);
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
     * 並列負荷テストを実行（単一クエリ用 - 後方互換性）
     *
     * @param {string} query - SQLクエリ
     * @param {string} [testName='Parallel Load Test'] - テスト名
     * @returns {Promise<Object>} テスト結果
     */
    async runParallelTests(query, testName = 'Parallel Load Test') {
        console.log('\n' + '='.repeat(60));
        console.log('Parallel Load Test Starting'.padStart(40));
        console.log('='.repeat(60));

        if (!this.parallelTester) {
            throw new Error('ParallelTester is not initialized. Set parallelTester property before calling this method.');
        }

        const results = await this.parallelTester.executeParallelTests(testName, query);
        return results;
    }

    /**
     * 並列負荷テストをファイルから実行
     *
     * @returns {Promise<Object>} テスト結果
     */
    async runParallelTestsFromFiles() {
        console.log('\n' + '='.repeat(60));
        console.log('Parallel Load Test (Multiple SQL Files)'.padStart(40));
        console.log('='.repeat(60));

        if (!this.parallelTester) {
            throw new Error('ParallelTester is not initialized. Set parallelTester property before calling this method.');
        }

        const parallelDir = this.config.test.parallelDirectory || './parallel';
        const results = await this.parallelTester.executeParallelTestsFromFiles(parallelDir);

        if (results) {
            // 並列テストの結果を testResults に追加
            Object.values(results).forEach(result => {
                if (result.metrics) {
                    this.testResults.push({
                        testName: `Parallel Load Test: ${result.strategy}`,
                        query: '(Multiple SQL files executed in parallel)',
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
     *
     * @returns {Promise<string|null>} 結果ディレクトリパス
     */
    async saveResults() {
        console.log('\n' + '='.repeat(60));
        console.log('Saving Results...'.padStart(40));
        console.log('='.repeat(60));

        const resultDir = this.config.test.resultDirectory;

        try {
            await fs.mkdir(resultDir, { recursive: true });

            // 生データ保存
            const resultsPath = path.join(resultDir, 'results.json');
            await fs.writeFile(
                resultsPath,
                JSON.stringify({
                    config: this.config,
                    results: this.testResults
                }, null, 2)
            );

            console.log(`\nResults saved: ${resultsPath}`);
            console.log(`Result directory: ${resultDir}`);

            return resultDir;
        } catch (error) {
            console.error(`Failed to save results: ${error.message}`);
            return null;
        }
    }

    /**
     * レポート生成
     *
     * @param {string} resultDir - 結果ディレクトリパス
     * @param {Object} reportGenerator - ReportGeneratorインスタンス
     * @param {Array} [exporters=[]] - エクスポーター配列（省略時は出力なし）
     * @returns {Promise<Object|null>} レポートパス
     */
    async generateReport(resultDir, reportGenerator, exporters = []) {
        if (!this.config.test?.generateReport) {
            console.log('\nReport generation is skipped');
            return null;
        }

        console.log('\n' + '='.repeat(60));
        console.log('Generating Reports...'.padStart(40));
        console.log('='.repeat(60));

        try {
            // analyze() は exportReports() 内部でも自動実行されるが、明示的に呼ぶ
            await reportGenerator.analyze();

            const exportedFiles = await reportGenerator.exportReports(resultDir, exporters);

            console.log('\nReport generation completed');
            console.log(`\nOutput directory: ${resultDir}`);
            if (Object.keys(exportedFiles).length > 0) {
                console.log('\nGenerated files:');
                for (const [name, filePath] of Object.entries(exportedFiles)) {
                    console.log(`  - ${name}: ${filePath}`);
                }
            }

            return exportedFiles;
        } catch (error) {
            console.error(`Failed to generate reports: ${error.message}`);
            return null;
        }
    }

    /**
     * クリーンアップ
     *
     * @returns {Promise<void>}
     */
    async cleanup() {
        console.log('\n' + '='.repeat(60));
        console.log('Cleaning up...'.padStart(40));
        console.log('='.repeat(60));

        if (this.tester) {
            // FileManagerのサマリーを表示
            if (this.tester.printFileManagerSummary) {
                this.tester.printFileManagerSummary();
            }

            await this.tester.cleanup();
        }

        if (this.parallelTester) {
            await this.parallelTester.cleanup();
        }

        console.log('Cleanup completed');
    }

    /**
     * テスター（MySQLPerformanceTester）を設定
     * @param {Object} tester - MySQLPerformanceTesterインスタンス
     */
    setTester(tester) {
        this.tester = tester;
    }

    /**
     * 並列テスター（ParallelPerformanceTester）を設定
     * @param {Object} parallelTester - ParallelPerformanceTesterインスタンス
     */
    setParallelTester(parallelTester) {
        this.parallelTester = parallelTester;
    }

    /**
     * テスト結果を取得
     * @returns {Array} テスト結果の配列
     */
    getTestResults() {
        return this.testResults;
    }

    /**
     * テスト結果をクリア
     */
    clearTestResults() {
        this.testResults = [];
    }

    /**
     * テスト結果のサマリーを取得
     * @returns {Object} サマリー情報
     */
    getTestSummary() {
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => {
            if (r.statistics) {
                return r.statistics.count.included > 0;
            }
            return r.parallelResults !== null;
        }).length;

        return {
            totalTests,
            successfulTests,
            failedTests: totalTests - successfulTests,
            successRate: totalTests > 0 ? (successfulTests / totalTests) * 100 : 0
        };
    }
}

export default TestRunner;
