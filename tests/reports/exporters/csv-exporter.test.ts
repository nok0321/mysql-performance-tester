import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { CsvExporter } from '../../../lib/reports/exporters/csv-exporter.js';

/**
 * Create minimal report data for CSV export tests
 */
function createReportData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        metadata: {
            generatedAt: '2025-01-01T00:00:00Z',
            configuration: {
                database: { host: 'localhost', port: 3306, database: 'testdb' },
                test: {
                    testIterations: 100,
                    parallelThreads: 4,
                    enableWarmup: true,
                    removeOutliers: true,
                    outlierMethod: 'iqr',
                },
            },
        },
        summary: {
            testCount: { total: 2, successful: 2, failed: 0 },
            performanceGrade: 'A',
            overallMetrics: {
                totalQueries: 200,
                averageP95: '12.5',
                maxQPS: '5000',
                avgQPS: '3500',
            },
        },
        details: [],
        recommendations: [],
        ...overrides,
    };
}

describe('CsvExporter', () => {
    const tmpDirs: string[] = [];

    async function makeTmpDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csv-exporter-'));
        tmpDirs.push(dir);
        return dir;
    }

    afterEach(async () => {
        for (const dir of tmpDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
        tmpDirs.length = 0;
    });

    describe('export / generateAllReports', () => {
        it('creates the output directory', async () => {
            const tmpDir = await makeTmpDir();
            const outputDir = path.join(tmpDir, 'nested', 'csv');
            const exporter = new CsvExporter();

            await exporter.export(createReportData(), outputDir);

            const stat = await fs.stat(outputDir);
            expect(stat.isDirectory()).toBe(true);
        });

        it('returns an object with all six CSV file paths', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();

            const files = await exporter.export(createReportData(), outputDir) as Record<string, string>;

            expect(files.summary).toContain('summary.csv');
            expect(files.testsOverview).toContain('tests_overview.csv');
            expect(files.detailedStats).toContain('detailed_statistics.csv');
            expect(files.parallelMetrics).toContain('parallel_metrics.csv');
            expect(files.recommendations).toContain('recommendations.csv');
            expect(files.warmup).toContain('warmup_analysis.csv');
        });

        it('creates all six CSV files on disk', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();

            await exporter.export(createReportData(), outputDir);

            const expectedFiles = [
                'summary.csv',
                'tests_overview.csv',
                'detailed_statistics.csv',
                'parallel_metrics.csv',
                'recommendations.csv',
                'warmup_analysis.csv',
            ];
            for (const file of expectedFiles) {
                const stat = await fs.stat(path.join(outputDir, file));
                expect(stat.isFile()).toBe(true);
            }
        });
    });

    describe('summary CSV', () => {
        it('contains header row and config values', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();

            await exporter.export(createReportData(), outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'summary.csv'),
                'utf8'
            );
            const lines = content.split('\n');

            // First line is the header
            expect(lines[0]).toBe('項目,値');
            // Check a few known rows
            expect(content).toContain('総合評価,A');
            expect(content).toContain('ホスト,localhost');
        });
    });

    describe('tests overview CSV', () => {
        it('includes header row with expected columns', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();

            await exporter.export(createReportData(), outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'tests_overview.csv'),
                'utf8'
            );
            const headerLine = content.split('\n')[0];
            expect(headerLine).toContain('テスト名');
            expect(headerLine).toContain('P95(ms)');
            expect(headerLine).toContain('評価');
        });

        it('includes data rows for each test detail', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'select_all',
                        query: 'SELECT * FROM users',
                        timestamp: '2025-01-01',
                        statistics: {
                            count: { total: 100, included: 100, outliers: 0 },
                            basic: { mean: 5.2, median: 4.8, min: 1.0, max: 20.0 },
                            percentiles: { p95: 12.5, p99: 18.0 },
                            spread: { stdDev: 3.1, cv: 15.2 },
                            outliers: { count: 2 },
                        },
                        performanceGrade: 'A',
                    },
                ],
            });

            await exporter.export(data, outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'tests_overview.csv'),
                'utf8'
            );
            const lines = content.split('\n');
            expect(lines.length).toBeGreaterThanOrEqual(2);
            expect(lines[1]).toContain('select_all');
        });
    });

    describe('recommendations CSV', () => {
        it('shows placeholder when no recommendations', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();

            await exporter.export(createReportData({ recommendations: [] }), outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'recommendations.csv'),
                'utf8'
            );
            expect(content).toContain('情報なし');
        });

        it('includes recommendation data when present', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new CsvExporter();
            const data = createReportData({
                recommendations: [
                    {
                        category: 'performance',
                        priority: 'high',
                        title: 'Fix latency',
                        description: 'P95 is too high',
                        actions: ['Add index', 'Optimize query'],
                    },
                ],
            });

            await exporter.export(data, outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'recommendations.csv'),
                'utf8'
            );
            expect(content).toContain('Fix latency');
            expect(content).toContain('Add index; Optimize query');
        });
    });

    describe('arrayToCSV', () => {
        it('joins rows with newlines and cells with commas', () => {
            const exporter = new CsvExporter();
            const result = exporter.arrayToCSV([
                ['a', 'b', 'c'],
                [1, 2, 3],
            ]);
            expect(result).toBe('a,b,c\n1,2,3');
        });
    });

    describe('escapeCSVCell', () => {
        it('returns empty string for null/undefined', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell(null)).toBe('');
            expect(exporter.escapeCSVCell(undefined)).toBe('');
        });

        it('wraps value in double quotes when it contains a comma', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell('hello, world')).toBe('"hello, world"');
        });

        it('escapes double quotes by doubling them', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell('say "hi"')).toBe('"say ""hi"""');
        });

        it('wraps value in double quotes when it contains a newline', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell('line1\nline2')).toBe('"line1\nline2"');
        });

        it('returns plain string when no special characters', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell('simple')).toBe('simple');
        });

        it('converts numbers to string', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell(42)).toBe('42');
        });

        it('converts booleans to string', () => {
            const exporter = new CsvExporter();
            expect(exporter.escapeCSVCell(true)).toBe('true');
        });
    });

    describe('cleanQuery', () => {
        it('returns dash for undefined query', () => {
            const exporter = new CsvExporter();
            expect(exporter.cleanQuery(undefined)).toBe('-');
        });

        it('collapses whitespace into single spaces', () => {
            const exporter = new CsvExporter();
            const result = exporter.cleanQuery('SELECT *\n  FROM\n    users');
            expect(result).toBe('SELECT * FROM users');
        });

        it('truncates long queries to 200 characters', () => {
            const exporter = new CsvExporter();
            const longQuery = 'SELECT ' + 'a'.repeat(300);
            const result = exporter.cleanQuery(longQuery);
            expect(result.length).toBe(200);
        });
    });
});
