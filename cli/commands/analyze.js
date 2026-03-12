/**
 * Analyze Command - 既存結果の分析コマンド
 */

import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { JsonExporter } from '../../lib/reports/exporters/json-exporter.js';
import { MarkdownExporter } from '../../lib/reports/exporters/markdown-exporter.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Analyze コマンド実行
 */
export async function analyzeCommand(options, resultPath) {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - 結果分析'.padStart(40));
    console.log('='.repeat(60));

    if (!resultPath) {
        console.error('\n❌ エラー: 結果ディレクトリまたはJSONファイルのパスを指定してください');
        console.log('\n使用方法:');
        console.log('  mysql-perf-test analyze <result-path>');
        console.log('\n例:');
        console.log('  mysql-perf-test analyze ./performance_results/2025-01-15T10-30-00');
        console.log('  mysql-perf-test analyze ./performance_results/2025-01-15T10-30-00/results.json');
        process.exit(1);
    }

    try {
        // 結果データの読み込み
        const { testResults, config, resultsFilePath } = await loadResults(resultPath);

        if (!testResults || testResults.length === 0) {
            console.error('\n❌ エラー: テスト結果が見つかりませんでした');
            process.exit(1);
        }

        console.log(`\n✓ ${testResults.length}件のテスト結果を読み込みました`);

        if (options.verbose) {
            console.log('\nテスト結果サマリー:');
            testResults.forEach((result, index) => {
                console.log(`  ${index + 1}. ${result.testName}`);
            });
        }

        // レポート生成
        const outputDir = options.outputDir || path.dirname(resultsFilePath);
        await generateReport(testResults, config, outputDir);

        console.log('\n' + '='.repeat(60));
        console.log('✅ 分析が完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ エラーが発生しました:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * 結果データの読み込み
 */
async function loadResults(resultPath) {
    try {
        // パスの検証
        const stats = await fs.stat(resultPath);

        let resultsFilePath;

        if (stats.isDirectory()) {
            // ディレクトリの場合、results.jsonまたはparallel-results.jsonを探す
            const possibleFiles = [
                path.join(resultPath, 'results.json'),
                path.join(resultPath, 'parallel-results.json')
            ];

            for (const filePath of possibleFiles) {
                try {
                    await fs.access(filePath);
                    resultsFilePath = filePath;
                    break;
                } catch {
                    // ファイルが存在しない場合は次を試す
                }
            }

            if (!resultsFilePath) {
                throw new Error(`結果ファイルが見つかりません: ${resultPath}`);
            }
        } else {
            // ファイルの場合
            resultsFilePath = resultPath;
        }

        console.log(`\n📂 結果ファイルを読み込み中: ${resultsFilePath}`);

        // JSONファイルの読み込み
        const content = await fs.readFile(resultsFilePath, 'utf8');
        const data = JSON.parse(content);

        return {
            testResults: data.results || [],
            config: data.config || {},
            resultsFilePath,
        };

    } catch (error) {
        throw new Error(`結果ファイルの読み込みに失敗: ${error.message}`);
    }
}

/**
 * レポート生成
 */
async function generateReport(testResults, config, outputDir) {
    console.log('\n' + '='.repeat(60));
    console.log('レポート生成中...'.padStart(40));
    console.log('='.repeat(60));

    try {
        // 出力ディレクトリの確保
        await fs.mkdir(outputDir, { recursive: true });

        const generator = new ReportGenerator(testResults, config);
        await generator.analyze();

        const exporters = [
            new JsonExporter(),
            new MarkdownExporter()
        ];

        const exportedFiles = await generator.exportReports(outputDir, exporters);

        console.log('\n✓ レポート生成完了');
        console.log(`\n📁 出力ディレクトリ: ${outputDir}`);
        console.log(`\n生成されたファイル:`);

        for (const [exporterName, filePath] of Object.entries(exportedFiles)) {
            console.log(`  - ${exporterName}: ${filePath}`);
        }

        // サマリー情報の表示
        const summary = generator.getSummary();
        if (summary) {
            console.log('\n📊 分析サマリー:');
            console.log(`  テスト総数: ${summary.totalTests || 0}`);
            if (summary.averageExecutionTime) {
                console.log(`  平均実行時間: ${summary.averageExecutionTime.toFixed(2)}ms`);
            }
            if (summary.totalExecutionTime) {
                console.log(`  総実行時間: ${summary.totalExecutionTime.toFixed(2)}ms`);
            }
        }

        // 推奨事項の表示
        const recommendations = generator.getRecommendations();
        if (recommendations && recommendations.length > 0) {
            console.log('\n💡 推奨事項:');
            recommendations.slice(0, 3).forEach((rec, index) => {
                console.log(`  ${index + 1}. [${rec.priority}] ${rec.title}`);
                if (rec.description) {
                    console.log(`     ${rec.description}`);
                }
            });

            if (recommendations.length > 3) {
                console.log(`  ... 他 ${recommendations.length - 3}件`);
            }
        }

        return exportedFiles;
    } catch (error) {
        console.error(`❌ レポート生成エラー: ${error.message}`);
        console.error(error.stack);
        throw error;
    }
}
