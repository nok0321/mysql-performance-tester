/**
 * レポートジェネレーター
 * テスト結果の分析とレポート生成を統合
 */

import { ReportAnalyzer } from './report-analyzer.js';
import { RecommendationEngine } from './recommendation-engine.js';

/**
 * レポートジェネレータークラス
 */
export class ReportGenerator {
    /**
     * @param {Array}  testResults - テスト結果の配列
     * @param {Object} config      - createTestConfig() が返すプレーンオブジェクト
     * @param {Object} [deps={}]   - 依存の注入（テスト・カスタマイズ用）
     *   deps.analyzer                    - ReportAnalyzer インスタンス
     *   deps.recommendationEngineFactory - (reportData) => RecommendationEngine
     */
    constructor(testResults, config, deps = {}) {
        this.testResults = testResults;
        this.config = config;
        this.reportData = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalTests: testResults.length,
                configuration: config
            },
            summary: null,
            details: [],
            recommendations: []
        };
        this.analyzer = deps.analyzer ?? new ReportAnalyzer(testResults, config);
        this._recommendationEngineFactory =
            deps.recommendationEngineFactory ?? ((reportData) => new RecommendationEngine(reportData));
        this._analyzed = false;
    }

    /**
     * 包括的な分析の実行
     */
    async analyze() {
        console.log('\n📊 分析を実行中...');

        // サマリーの生成
        this.reportData.summary = this.analyzer.generateSummary();

        // 各テストの詳細分析
        for (const testResult of this.testResults) {
            const analysis = this.analyzer.analyzeTestResult(testResult);
            this.reportData.details.push(analysis);
        }

        // 推奨事項の生成
        const recommendationEngine = this._recommendationEngineFactory(this.reportData);
        this.reportData.recommendations = recommendationEngine.generateRecommendations();

        this._analyzed = true;
        console.log('✓ 分析完了');

        return this.reportData;
    }

    /**
     * レポートのエクスポート
     * analyze() が未実行の場合は自動的に実行する。
     * @param {string} outputDir
     * @param {Array} [exporters=[]] - エクスポーター配列（省略時は出力なし）
     */
    async exportReports(outputDir, exporters = []) {
        if (!this._analyzed) {
            await this.analyze();
        }
        const exportedFiles = {};

        for (const exporter of exporters) {
            try {
                const filePath = await exporter.export(this.reportData, outputDir);
                exportedFiles[exporter.constructor.name] = filePath;
                console.log(`✓ ${exporter.constructor.name}: ${filePath}`);
            } catch (error) {
                console.error(`✗ ${exporter.constructor.name} エラー: ${error.message}`);
            }
        }

        return exportedFiles;
    }

    /**
     * レポートデータの取得
     */
    getReportData() {
        return this.reportData;
    }

    /**
     * サマリーの取得
     */
    getSummary() {
        return this.reportData.summary;
    }

    /**
     * 推奨事項の取得
     */
    getRecommendations() {
        return this.reportData.recommendations;
    }

    /**
     * テスト詳細の取得
     */
    getTestDetails() {
        return this.reportData.details;
    }
}
