/**
 * Excel Exporter
 * Uses ExcelJS to export report data in Excel format
 */

import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { BaseExporter } from './base-exporter.js';

interface ExcelReportData {
    summary?: {
        totalTests?: number;
        totalDuration?: number;
    };
    generatedAt?: string;
    config?: {
        testIterations?: number;
        parallelThreads?: number;
        outlierMethod?: string;
    };
    testResults?: ExcelTestResult[];
    tests?: ExcelTestResult[];
    recommendations?: ExcelRecommendation[];
    metadata?: Record<string, unknown>;
}

interface ExcelTestResult {
    testName?: string;
    name?: string;
    grade?: string;
    performanceGrade?: string;
    statistics?: {
        basic?: {
            mean?: number;
            median?: number;
            min?: number;
            max?: number;
        };
        percentiles?: {
            p95?: number;
            p99?: number;
        };
        spread?: {
            stdDev?: number;
            cv?: number;
        };
    };
    stats?: {
        basic?: Record<string, number>;
        percentiles?: Record<string, number>;
        spread?: Record<string, number>;
    };
}

interface ExcelRecommendation {
    category?: string;
    priority?: string;
    severity?: string;
    message?: string;
    text?: string;
}

type FillPattern = ExcelJS.FillPattern;

/**
 * Excel exporter class
 */
export class ExcelExporter extends BaseExporter {
    /**
     * Export report as an Excel file
     * @param reportData - Report data
     * @param outputDir - Output directory
     * @returns Path of the generated Excel file
     */
    async export(reportData: Record<string, unknown>, outputDir: string): Promise<string> {
        await fs.mkdir(outputDir, { recursive: true });
        const excelPath = path.join(outputDir, 'analysis-report.xlsx');

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MySQL Performance Tester';
        workbook.created = new Date();

        const data = reportData as unknown as ExcelReportData;

        // --- Summary Sheet ---
        this._addSummarySheet(workbook, data);

        // --- Test Results Sheet ---
        this._addTestResultsSheet(workbook, data);

        // --- Recommendations Sheet ---
        this._addRecommendationsSheet(workbook, data);

        await workbook.xlsx.writeFile(excelPath);
        return excelPath;
    }

    /**
     * Add summary sheet
     */
    _addSummarySheet(workbook: ExcelJS.Workbook, reportData: ExcelReportData): void {
        const sheet = workbook.addWorksheet('Summary');

        // Header style
        const headerFill: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

        sheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 25 },
        ];

        // Apply header style
        sheet.getRow(1).eachCell(cell => {
            cell.fill = headerFill;
            cell.font = headerFont;
        });

        const summary = reportData.summary || {};
        const rows: Array<{ metric: string; value: string | number }> = [
            { metric: 'Total Tests', value: summary.totalTests ?? 'N/A' },
            { metric: 'Total Duration (ms)', value: summary.totalDuration ?? 'N/A' },
            { metric: 'Generated At', value: reportData.generatedAt ?? new Date().toISOString() },
        ];

        // Add config info if available
        if (reportData.config) {
            const cfg = reportData.config;
            if (cfg.testIterations) rows.push({ metric: 'Iterations', value: cfg.testIterations });
            if (cfg.parallelThreads) rows.push({ metric: 'Parallel Threads', value: cfg.parallelThreads });
            if (cfg.outlierMethod) rows.push({ metric: 'Outlier Method', value: cfg.outlierMethod });
        }

        rows.forEach(row => sheet.addRow(row));
    }

    /**
     * Add test results sheet
     */
    _addTestResultsSheet(workbook: ExcelJS.Workbook, reportData: ExcelReportData): void {
        const sheet = workbook.addWorksheet('Test Results');

        const headerFill: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

        sheet.columns = [
            { header: 'Test Name', key: 'testName', width: 30 },
            { header: 'Mean (ms)', key: 'mean', width: 15 },
            { header: 'Median (ms)', key: 'median', width: 15 },
            { header: 'P95 (ms)', key: 'p95', width: 15 },
            { header: 'P99 (ms)', key: 'p99', width: 15 },
            { header: 'Min (ms)', key: 'min', width: 15 },
            { header: 'Max (ms)', key: 'max', width: 15 },
            { header: 'StdDev (ms)', key: 'stdDev', width: 15 },
            { header: 'CV (%)', key: 'cv', width: 12 },
            { header: 'Grade', key: 'grade', width: 10 },
        ];

        sheet.getRow(1).eachCell(cell => {
            cell.fill = headerFill;
            cell.font = headerFont;
        });

        const tests = reportData.testResults || reportData.tests || [];
        for (const test of tests) {
            const stats = test.statistics || test.stats || {};
            const basic = stats.basic || {};
            const spread = stats.spread || {};
            const percentiles = stats.percentiles || {};

            sheet.addRow({
                testName: test.testName || test.name || 'Unknown',
                mean: basic.mean ?? 'N/A',
                median: basic.median ?? 'N/A',
                p95: percentiles.p95 ?? 'N/A',
                p99: percentiles.p99 ?? 'N/A',
                min: basic.min ?? 'N/A',
                max: basic.max ?? 'N/A',
                stdDev: spread.stdDev ?? 'N/A',
                cv: spread.cv ?? 'N/A',
                grade: test.grade || test.performanceGrade || 'N/A',
            });
        }
    }

    /**
     * Add recommendations sheet
     */
    _addRecommendationsSheet(workbook: ExcelJS.Workbook, reportData: ExcelReportData): void {
        const recommendations = reportData.recommendations || [];
        if (recommendations.length === 0) return;

        const sheet = workbook.addWorksheet('Recommendations');

        const headerFill: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

        sheet.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Priority', key: 'priority', width: 12 },
            { header: 'Recommendation', key: 'recommendation', width: 60 },
        ];

        sheet.getRow(1).eachCell(cell => {
            cell.fill = headerFill;
            cell.font = headerFont;
        });

        recommendations.forEach((rec, i) => {
            sheet.addRow({
                num: i + 1,
                category: rec.category || 'General',
                priority: rec.priority || rec.severity || 'Medium',
                recommendation: rec.message || rec.text || String(rec),
            });
        });
    }
}
