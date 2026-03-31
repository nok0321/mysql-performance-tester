/**
 * Report Generator
 * Integrates test result analysis and report generation
 */

import { ReportAnalyzer } from './report-analyzer.js';
import { RecommendationEngine } from './recommendation-engine.js';
import { BaseExporter } from './exporters/base-exporter.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReportMetadata {
    generatedAt: string;
    totalTests: number;
    configuration: Record<string, unknown>;
}

interface ReportData {
    metadata: ReportMetadata;
    summary: any;
    details: any[];
    recommendations: any[];
}

interface ReportGeneratorDeps {
    analyzer?: ReportAnalyzer;
    recommendationEngineFactory?: (reportData: any) => RecommendationEngine;
}

/**
 * Report generator class
 */
export class ReportGenerator {
    testResults: any[];
    config: Record<string, unknown>;
    reportData: ReportData;
    analyzer: ReportAnalyzer;
    private _recommendationEngineFactory: (reportData: any) => RecommendationEngine;
    private _analyzed: boolean;

    /**
     * @param testResults - Array of test results
     * @param config - Plain object returned by createTestConfig()
     * @param deps - Dependency injection (for testing/customization)
     */
    constructor(testResults: any[], config: Record<string, unknown>, deps: ReportGeneratorDeps = {}) {
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
            deps.recommendationEngineFactory ?? ((reportData: any) => new RecommendationEngine(reportData));
        this._analyzed = false;
    }

    /**
     * Execute comprehensive analysis
     */
    async analyze(): Promise<ReportData> {
        console.log('\n📊 分析を実行中...');

        // Generate summary
        this.reportData.summary = this.analyzer.generateSummary();

        // Detailed analysis of each test
        for (const testResult of this.testResults) {
            const analysis = this.analyzer.analyzeTestResult(testResult);
            this.reportData.details.push(analysis);
        }

        // Generate recommendations
        const recommendationEngine = this._recommendationEngineFactory(this.reportData);
        this.reportData.recommendations = recommendationEngine.generateRecommendations();

        this._analyzed = true;
        console.log('✓ 分析完了');

        return this.reportData;
    }

    /**
     * Export reports
     * Automatically executes analyze() if it hasn't been called yet.
     * @param outputDir - Output directory
     * @param exporters - Array of exporters (no output if omitted)
     */
    async exportReports(outputDir: string, exporters: BaseExporter[] = []): Promise<Record<string, string>> {
        if (!this._analyzed) {
            await this.analyze();
        }
        const exportedFiles: Record<string, string> = {};

        for (const exporter of exporters) {
            try {
                const filePath = await exporter.export(this.reportData as unknown as Record<string, unknown>, outputDir);
                exportedFiles[exporter.constructor.name] = filePath;
                console.log(`✓ ${exporter.constructor.name}: ${filePath}`);
            } catch (error) {
                console.error(`✗ ${exporter.constructor.name} error: ${(error as Error).message}`);
            }
        }

        return exportedFiles;
    }

    /**
     * Get report data
     */
    getReportData(): ReportData {
        return this.reportData;
    }

    /**
     * Get summary
     */
    getSummary(): any {
        return this.reportData.summary;
    }

    /**
     * Get recommendations
     */
    getRecommendations(): any[] {
        return this.reportData.recommendations;
    }

    /**
     * Get test details
     */
    getTestDetails(): any[] {
        return this.reportData.details;
    }
}
