import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { JsonExporter } from '../../../lib/reports/exporters/json-exporter.js';

describe('JsonExporter', () => {
    const tmpDirs: string[] = [];

    /**
     * Create a unique temp directory for each test
     */
    async function makeTmpDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-exporter-'));
        tmpDirs.push(dir);
        return dir;
    }

    afterEach(async () => {
        for (const dir of tmpDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
        tmpDirs.length = 0;
    });

    it('creates the output directory if it does not exist', async () => {
        const tmpDir = await makeTmpDir();
        const outputDir = path.join(tmpDir, 'nested', 'output');
        const exporter = new JsonExporter();

        await exporter.export({}, outputDir);

        const stat = await fs.stat(outputDir);
        expect(stat.isDirectory()).toBe(true);
    });

    it('returns the path to the generated JSON file', async () => {
        const outputDir = await makeTmpDir();
        const exporter = new JsonExporter();

        const result = await exporter.export({ foo: 'bar' }, outputDir);

        expect(result).toBe(path.join(outputDir, 'analysis-report.json'));
    });

    it('writes valid JSON to the output file', async () => {
        const outputDir = await makeTmpDir();
        const exporter = new JsonExporter();
        const reportData = { summary: { grade: 'A' }, details: [1, 2, 3] };

        await exporter.export(reportData, outputDir);

        const content = await fs.readFile(
            path.join(outputDir, 'analysis-report.json'),
            'utf8'
        );
        const parsed = JSON.parse(content);
        expect(parsed).toEqual(reportData);
    });

    it('pretty-prints JSON with 2-space indentation', async () => {
        const outputDir = await makeTmpDir();
        const exporter = new JsonExporter();
        const reportData = { a: 1 };

        await exporter.export(reportData, outputDir);

        const content = await fs.readFile(
            path.join(outputDir, 'analysis-report.json'),
            'utf8'
        );
        expect(content).toBe(JSON.stringify(reportData, null, 2));
    });

    it('handles an empty report data object', async () => {
        const outputDir = await makeTmpDir();
        const exporter = new JsonExporter();

        const result = await exporter.export({}, outputDir);
        const content = await fs.readFile(result, 'utf8');
        const parsed = JSON.parse(content);

        expect(parsed).toEqual({});
    });

    it('handles complex nested report data', async () => {
        const outputDir = await makeTmpDir();
        const exporter = new JsonExporter();
        const reportData = {
            metadata: { generatedAt: '2025-01-01T00:00:00Z', totalTests: 3 },
            summary: {
                performanceGrade: 'B',
                overallMetrics: { averageP95: '45.3', maxQPS: '3200' },
                testCount: { total: 3, successful: 2, failed: 1 },
            },
            details: [
                { testName: 'test1', statistics: { basic: { mean: 10 } } },
            ],
            recommendations: [
                { priority: 'high', category: 'performance', title: 'Fix it', description: 'Desc', actions: ['action1'] },
            ],
        };

        await exporter.export(reportData, outputDir);

        const content = await fs.readFile(
            path.join(outputDir, 'analysis-report.json'),
            'utf8'
        );
        expect(JSON.parse(content)).toEqual(reportData);
    });
});
