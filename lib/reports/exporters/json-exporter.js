/**
 * JSONエクスポーター
 * レポートデータをJSON形式でエクスポート
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

/**
 * JSONエクスポータークラス
 */
export class JsonExporter extends BaseExporter {
    /**
     * レポートをJSONファイルとしてエクスポート
     */
    async export(reportData, outputDir) {
        await fs.mkdir(outputDir, { recursive: true });

        const jsonPath = path.join(outputDir, 'analysis-report.json');
        await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

        return jsonPath;
    }
}
