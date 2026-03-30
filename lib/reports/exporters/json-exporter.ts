/**
 * JSON Exporter
 * Exports report data in JSON format
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

/**
 * JSON exporter class
 */
export class JsonExporter extends BaseExporter {
    /**
     * Export report as a JSON file
     */
    async export(reportData: Record<string, unknown>, outputDir: string): Promise<string> {
        await fs.mkdir(outputDir, { recursive: true });

        const jsonPath = path.join(outputDir, 'analysis-report.json');
        await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

        return jsonPath;
    }
}
