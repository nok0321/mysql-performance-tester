import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { MarkdownExporter } from '../../../lib/reports/exporters/markdown-exporter.js';

/**
 * Create minimal report data for Markdown export tests
 */
function createReportData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        metadata: {
            generatedAt: '2025-01-01T00:00:00Z',
            totalTests: 2,
        },
        summary: {
            performanceGrade: 'A',
            overallMetrics: {
                averageP95: '12.5',
                maxQPS: '5000',
                avgQPS: '3500',
                totalQueries: 200,
            },
            testCount: { total: 2, successful: 2, failed: 0 },
        },
        recommendations: [],
        details: [],
        ...overrides,
    };
}

describe('MarkdownExporter', () => {
    const tmpDirs: string[] = [];

    async function makeTmpDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-exporter-'));
        tmpDirs.push(dir);
        return dir;
    }

    afterEach(async () => {
        for (const dir of tmpDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
        tmpDirs.length = 0;
    });

    describe('export', () => {
        it('creates the output directory if it does not exist', async () => {
            const tmpDir = await makeTmpDir();
            const outputDir = path.join(tmpDir, 'nested', 'md');
            const exporter = new MarkdownExporter();

            await exporter.export(createReportData(), outputDir);

            const stat = await fs.stat(outputDir);
            expect(stat.isDirectory()).toBe(true);
        });

        it('returns the path to the generated Markdown file', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new MarkdownExporter();

            const result = await exporter.export(createReportData(), outputDir);

            expect(result).toBe(path.join(outputDir, 'analysis-report.md'));
        });

        it('writes a non-empty file', async () => {
            const outputDir = await makeTmpDir();
            const exporter = new MarkdownExporter();

            await exporter.export(createReportData(), outputDir);

            const content = await fs.readFile(
                path.join(outputDir, 'analysis-report.md'),
                'utf8'
            );
            expect(content.length).toBeGreaterThan(0);
        });
    });

    describe('generateMarkdown', () => {
        it('includes the report title as H1', () => {
            const exporter = new MarkdownExporter();
            const md = exporter.generateMarkdown(createReportData() as never);
            expect(md).toContain('# MySQL Performance Test Report');
        });

        it('includes metadata (generated date and test count)', () => {
            const exporter = new MarkdownExporter();
            const md = exporter.generateMarkdown(createReportData() as never);

            expect(md).toContain('2025-01-01T00:00:00Z');
            expect(md).toContain('2');
        });

        it('includes summary section with grade and metrics', () => {
            const exporter = new MarkdownExporter();
            const md = exporter.generateMarkdown(createReportData() as never);

            expect(md).toContain('## サマリー');
            expect(md).toContain('総合評価:** A');
            expect(md).toContain('12.5');
            expect(md).toContain('5000');
        });

        it('shows N/A for null metrics', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                summary: {
                    performanceGrade: 'N/A',
                    overallMetrics: {
                        averageP95: null,
                        maxQPS: null,
                        avgQPS: null,
                        totalQueries: 0,
                    },
                    testCount: { total: 0, successful: 0, failed: 0 },
                },
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('N/A');
        });

        it('includes recommendations section when recommendations exist', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                recommendations: [
                    {
                        title: 'Improve Latency',
                        priority: 'high',
                        description: 'P95 is too high',
                        actions: ['Add index', 'Optimize query'],
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('## 推奨事項');
            expect(md).toContain('### Improve Latency [HIGH]');
            expect(md).toContain('P95 is too high');
            expect(md).toContain('- Add index');
            expect(md).toContain('- Optimize query');
        });

        it('omits recommendations section when there are none', () => {
            const exporter = new MarkdownExporter();
            const md = exporter.generateMarkdown(createReportData() as never);
            expect(md).not.toContain('## 推奨事項');
        });

        it('includes test details section', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'simple_select',
                        query: 'SELECT * FROM users',
                        statistics: {
                            grade: 'A',
                            percentiles: { p50: 3, p95: 10, p99: 15 },
                            basic: { mean: 5 },
                        },
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('## テスト詳細');
            expect(md).toContain('### 1. simple_select');
            expect(md).toContain('`SELECT * FROM users`');
            expect(md).toContain('[A]');
        });

        it('renders parallel test metrics', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'parallel_load',
                        isParallelTest: true,
                        parallelMetrics: {
                            strategy: 'round-robin',
                            duration: { total: 5000, seconds: 5 },
                            queries: { total: 1000, completed: 990, failed: 10, successRate: '99%' },
                            throughput: { qps: 200, effectiveQps: 198, grade: 'B' },
                            latency: {
                                percentiles: { p50: 3, p95: 10, p99: 15 },
                                basic: { mean: 5, min: 1, max: 30 },
                                spread: { stdDev: 4.2, cv: 25 },
                                grade: 'A',
                            },
                        },
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('round-robin');
            expect(md).toContain('200.00');
            expect(md).toContain('QPS');
            expect(md).toContain('成功率: 99%');
        });

        it('renders per-file breakdown table for parallel tests', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'parallel_load',
                        isParallelTest: true,
                        parallelMetrics: {
                            strategy: 'round-robin',
                            duration: { total: 5000, seconds: 5 },
                            queries: { total: 100, completed: 100, failed: 0, successRate: '100%' },
                            throughput: { qps: 200, effectiveQps: 200, grade: 'A' },
                            latency: {
                                percentiles: { p50: 3, p95: 10, p99: 15 },
                                basic: { mean: 5, min: 1, max: 30 },
                                spread: { stdDev: 4, cv: 20 },
                                grade: 'A',
                            },
                            perFile: {
                                '01_select.sql': {
                                    completed: 50,
                                    failed: 0,
                                    successRate: '100%',
                                    latency: { mean: 4, p50: 3, p95: 8, p99: 12, min: 1, max: 20 },
                                },
                            },
                        },
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('SQLファイル別内訳');
            expect(md).toContain('01_select.sql');
            expect(md).toContain('| ファイル名 |');
        });

        it('renders buffer pool information', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'bp_test',
                        statistics: {
                            grade: 'B',
                            percentiles: { p50: 5, p95: 15, p99: 25 },
                            basic: { mean: 8 },
                        },
                        bufferPool: { grade: 'C', hitRatio: 88.5 },
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('Buffer Pool [C]');
            expect(md).toContain('88.5%');
        });

        it('includes interpretation notes when available', () => {
            const exporter = new MarkdownExporter();
            const data = createReportData({
                details: [
                    {
                        testName: 'interp_test',
                        statistics: {
                            grade: 'B',
                            percentiles: { p50: 5, p95: 15, p99: 25 },
                            basic: { mean: 8 },
                            interpretation: ['Latency is acceptable', 'Consider adding index'],
                        },
                    },
                ],
            });
            const md = exporter.generateMarkdown(data as never);

            expect(md).toContain('Latency is acceptable');
            expect(md).toContain('Consider adding index');
        });
    });
});
