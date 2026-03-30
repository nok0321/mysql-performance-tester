/**
 * Analyze Command - Analyze existing results
 */

import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { JsonExporter } from '../../lib/reports/exporters/json-exporter.js';
import { MarkdownExporter } from '../../lib/reports/exporters/markdown-exporter.js';
import { promises as fs } from 'fs';
import path from 'path';
import type { ParsedOptions } from '../options.js';

/** Loaded results data */
interface LoadedResults {
    testResults: Array<{ testName: string; [key: string]: unknown }>;
    config: Record<string, unknown>;
    resultsFilePath: string;
}

/**
 * Execute the analyze command
 */
export async function analyzeCommand(options: ParsedOptions, resultPath: string | undefined): Promise<void> {
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
        // Load result data
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

        // Generate report
        const outputDir = options.outputDir || path.dirname(resultsFilePath);
        await generateReport(testResults, config, outputDir);

        console.log('\n' + '='.repeat(60));
        console.log('✅ 分析が完了しました！'.padStart(40));
        console.log('='.repeat(60));

    } catch (error: unknown) {
        console.error('\n❌ エラーが発生しました:', error);
        if (error instanceof Error) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Load result data from disk
 */
async function loadResults(resultPath: string): Promise<LoadedResults> {
    try {
        // Validate path
        const stats = await fs.stat(resultPath);

        let resultsFilePath: string | undefined;

        if (stats.isDirectory()) {
            // If directory, look for results.json or parallel-results.json
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
                    // File does not exist, try next
                }
            }

            if (!resultsFilePath) {
                throw new Error(`結果ファイルが見つかりません: ${resultPath}`);
            }
        } else {
            // Direct file path
            resultsFilePath = resultPath;
        }

        console.log(`\n📂 結果ファイルを読み込み中: ${resultsFilePath}`);

        // Read JSON file
        const content = await fs.readFile(resultsFilePath, 'utf8');
        const data = JSON.parse(content) as {
            results?: Array<{ testName: string; [key: string]: unknown }>;
            config?: Record<string, unknown>;
        };

        return {
            testResults: data.results || [],
            config: data.config || {},
            resultsFilePath,
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`結果ファイルの読み込みに失敗: ${message}`);
    }
}

/**
 * Generate report
 */
async function generateReport(
    testResults: Array<{ testName: string; [key: string]: unknown }>,
    config: Record<string, unknown>,
    outputDir: string
): Promise<Record<string, string>> {
    console.log('\n' + '='.repeat(60));
    console.log('レポート生成中...'.padStart(40));
    console.log('='.repeat(60));

    try {
        // Ensure output directory exists
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

        // Display summary information
        const summary = generator.getSummary() as {
            totalTests?: number;
            averageExecutionTime?: number;
            totalExecutionTime?: number;
        } | null;
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

        // Display recommendations
        const recommendations = generator.getRecommendations() as Array<{
            priority: string;
            title: string;
            description?: string;
        }>;
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`❌ レポート生成エラー: ${message}`);
        console.error(stack);
        throw error;
    }
}
