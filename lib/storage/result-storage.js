/**
 * Result Storage
 * テスト結果の保存・読み込み・一覧取得を管理
 */

import fs from 'fs/promises';
import path from 'path';

export class ResultStorage {
    constructor(config = {}) {
        this.config = {
            resultDirectory: config.resultDirectory || './performance_results',
            enableAutoSave: config.enableAutoSave !== false,
            format: config.format || 'json', // 'json' or 'csv'
            includeTimestamp: config.includeTimestamp !== false,
            ...config
        };
    }

    /**
     * 結果ディレクトリの初期化
     */
    async initialize() {
        try {
            await fs.mkdir(this.config.resultDirectory, { recursive: true });
            console.log(`📁 結果保存ディレクトリ: ${this.config.resultDirectory}`);
        } catch (error) {
            console.warn(`⚠️ 結果ディレクトリ作成エラー: ${error.message}`);
        }
    }

    /**
     * テスト結果を保存
     * @param {Array|Object} results - テスト結果（配列または単一オブジェクト）
     * @param {string} name - ファイル名（オプション）
     * @returns {string|null} 保存されたファイルパス
     */
    async save(results, name = 'results') {
        if (!this.config.enableAutoSave) {
            return null;
        }

        try {
            // ディレクトリが存在しない場合は作成
            await fs.mkdir(this.config.resultDirectory, { recursive: true });

            const timestamp = this.config.includeTimestamp ? this.getTimestamp() : '';
            const sanitizedName = this.sanitizeFileName(name);
            const fileName = `${sanitizedName}${timestamp}.${this.config.format}`;
            const filePath = path.join(this.config.resultDirectory, fileName);

            // 結果をJSON形式で保存
            if (this.config.format === 'json') {
                await this.saveAsJson(filePath, results);
            } else if (this.config.format === 'csv') {
                await this.saveAsCsv(filePath, results);
            }

            console.log(`💾 結果を保存しました: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error(`結果の保存に失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * JSON形式で保存
     * @param {string} filePath - ファイルパス
     * @param {Array|Object} results - 保存するデータ
     */
    async saveAsJson(filePath, results) {
        const data = Array.isArray(results) ? results : [results];
        const output = {
            metadata: {
                savedAt: new Date().toISOString(),
                version: '2.0',
                count: data.length
            },
            results: data
        };

        await fs.writeFile(
            filePath,
            JSON.stringify(output, null, 2),
            'utf8'
        );
    }

    /**
     * CSV形式で保存
     * @param {string} filePath - ファイルパス
     * @param {Array|Object} results - 保存するデータ
     */
    async saveAsCsv(filePath, results) {
        const data = Array.isArray(results) ? results : [results];

        // CSVヘッダー
        const headers = [
            'TestName',
            'Timestamp',
            'AvgDuration',
            'MinDuration',
            'MaxDuration',
            'P50',
            'P95',
            'P99',
            'Iterations',
            'SuccessRate'
        ];

        // CSVボディ
        const rows = data.map(result => {
            const stats = result.statistics || {};
            const basic = stats.basic || {};
            const percentiles = stats.percentiles || {};
            const count = stats.count || {};

            return [
                result.testName || '',
                result.timestamp || '',
                basic.mean || '',
                basic.min || '',
                basic.max || '',
                percentiles.p50 || '',
                percentiles.p95 || '',
                percentiles.p99 || '',
                count.total || '',
                count.total > 0 ? ((count.included / count.total) * 100).toFixed(2) : ''
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        await fs.writeFile(filePath, csvContent, 'utf8');
    }

    /**
     * 結果を読み込み
     * @param {string} fileName - ファイル名（フルパスまたは相対パス）
     * @returns {Object|null} 読み込んだ結果
     */
    async load(fileName) {
        try {
            // ファイル名のみの場合は結果ディレクトリと結合
            const filePath = path.isAbsolute(fileName)
                ? fileName
                : path.join(this.config.resultDirectory, fileName);

            const content = await fs.readFile(filePath, 'utf8');

            if (fileName.endsWith('.json')) {
                return JSON.parse(content);
            } else if (fileName.endsWith('.csv')) {
                return this.parseCsv(content);
            }

            return null;
        } catch (error) {
            console.error(`結果の読み込みに失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * CSV内容をパース
     * @param {string} content - CSV内容
     * @returns {Object} パースされたデータ
     */
    parseCsv(content) {
        const lines = content.split('\n');
        const headers = lines[0].split(',');
        const results = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            const result = {};

            headers.forEach((header, index) => {
                result[header] = values[index];
            });

            results.push(result);
        }

        return {
            metadata: {
                format: 'csv',
                count: results.length
            },
            results
        };
    }

    /**
     * 保存されている結果の一覧を取得
     * @param {Object} options - フィルタオプション
     * @returns {Array} ファイル情報の配列
     */
    async list(options = {}) {
        try {
            const files = await fs.readdir(this.config.resultDirectory);

            const fileInfos = await Promise.all(
                files
                    .filter(file => {
                        // フォーマットフィルタ
                        if (options.format) {
                            return file.endsWith(`.${options.format}`);
                        }
                        return file.endsWith('.json') || file.endsWith('.csv');
                    })
                    .map(async file => {
                        const filePath = path.join(this.config.resultDirectory, file);
                        const stats = await fs.stat(filePath);

                        return {
                            name: file,
                            path: filePath,
                            size: stats.size,
                            created: stats.birthtime,
                            modified: stats.mtime,
                            isJson: file.endsWith('.json'),
                            isCsv: file.endsWith('.csv')
                        };
                    })
            );

            // ソート（新しい順）
            fileInfos.sort((a, b) => b.modified - a.modified);

            // 件数制限
            if (options.limit) {
                return fileInfos.slice(0, options.limit);
            }

            return fileInfos;
        } catch (error) {
            console.error(`ファイル一覧の取得に失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 古い結果ファイルを削除
     * @param {number} maxAge - 最大保持日数
     * @returns {number} 削除したファイル数
     */
    async cleanup(maxAge = 30) {
        try {
            const files = await fs.readdir(this.config.resultDirectory);
            const now = Date.now();
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.config.resultDirectory, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️ ${deletedCount}個の古い結果ファイルを削除しました`);
            }

            return deletedCount;
        } catch (error) {
            console.warn(`⚠️ クリーンアップエラー: ${error.message}`);
            return 0;
        }
    }

    /**
     * 特定のファイルを削除
     * @param {string} fileName - ファイル名
     * @returns {boolean} 削除成功フラグ
     */
    async delete(fileName) {
        try {
            const filePath = path.isAbsolute(fileName)
                ? fileName
                : path.join(this.config.resultDirectory, fileName);

            await fs.unlink(filePath);
            console.log(`🗑️ ファイルを削除しました: ${fileName}`);
            return true;
        } catch (error) {
            console.error(`ファイルの削除に失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 結果をマージして保存
     * @param {Array} fileNames - マージするファイル名の配列
     * @param {string} outputName - 出力ファイル名
     * @returns {string|null} 保存されたファイルパス
     */
    async merge(fileNames, outputName = 'merged_results') {
        try {
            const allResults = [];

            for (const fileName of fileNames) {
                const data = await this.load(fileName);
                if (data && data.results) {
                    allResults.push(...data.results);
                }
            }

            if (allResults.length === 0) {
                console.warn('マージする結果がありません');
                return null;
            }

            return await this.save(allResults, outputName);
        } catch (error) {
            console.error(`結果のマージに失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * タイムスタンプの生成
     * @returns {string} タイムスタンプ文字列
     */
    getTimestamp() {
        const now = new Date();
        return `_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    }

    /**
     * ファイル名のサニタイズ
     * @param {string} name - ファイル名
     * @returns {string} サニタイズされたファイル名
     */
    sanitizeFileName(name) {
        return name
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_{2,}/g, '_')
            .substring(0, 100);
    }

    /**
     * ストレージ統計を取得
     * @returns {Object} ストレージ統計
     */
    async getStats() {
        try {
            const files = await this.list();
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);

            return {
                totalFiles: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                jsonFiles: files.filter(f => f.isJson).length,
                csvFiles: files.filter(f => f.isCsv).length,
                oldestFile: files.length > 0 ? files[files.length - 1] : null,
                newestFile: files.length > 0 ? files[0] : null
            };
        } catch (error) {
            console.error(`統計の取得に失敗: ${error.message}`);
            return null;
        }
    }
}

export default ResultStorage;
