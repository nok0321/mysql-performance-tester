/**
 * File Manager
 * デバッグ情報、分析結果、トレース情報などのファイル出力を管理
 */

import fs from 'fs/promises';
import path from 'path';

export class FileManager {
    constructor(config = {}) {
        this.config = {
            outputDir: config.outputDir || './debug-output',
            enableDebugOutput: config.enableDebugOutput !== false,
            enableTimestamp: config.enableTimestamp !== false,
            maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
            ...config
        };

        this.fileCounter = {
            explainAnalyze: 0,
            optimizerTrace: 0,
            queryPlan: 0,
            general: 0
        };
    }

    /**
     * 出力ディレクトリの初期化
     */
    async initialize() {
        if (!this.config.enableDebugOutput) {
            return;
        }

        try {
            await fs.mkdir(this.config.outputDir, { recursive: true });
            console.log(`📁 デバッグ出力ディレクトリ: ${this.config.outputDir}`);
        } catch (error) {
            console.warn(`⚠️ 出力ディレクトリ作成エラー: ${error.message}`);
        }
    }

    /**
     * EXPLAIN ANALYZEの結果を保存
     * @param {Object} analyzeResult - EXPLAIN ANALYZEの結果
     * @param {string} queryName - クエリ名
     * @returns {string|null} 保存されたファイルパス
     */
    async saveExplainAnalyze(analyzeResult, queryName = 'query') {
        if (!this.config.enableDebugOutput || !analyzeResult) {
            return null;
        }

        try {
            this.fileCounter.explainAnalyze++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `explain-analyze_${this.sanitizeFileName(queryName)}_${this.fileCounter.explainAnalyze}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'EXPLAIN_ANALYZE',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.explainAnalyze
                },
                result: analyzeResult
            };

            await this.writeJsonFile(filePath, output);

            // テキスト形式のツリーも保存
            if (analyzeResult.tree) {
                const treeFileName = `explain-analyze_${this.sanitizeFileName(queryName)}_${this.fileCounter.explainAnalyze}${timestamp}.txt`;
                const treeFilePath = path.join(this.config.outputDir, treeFileName);
                await fs.writeFile(treeFilePath, analyzeResult.tree, 'utf8');
            }

            console.log(`💾 EXPLAIN ANALYZE保存: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ EXPLAIN ANALYZE保存エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * Optimizer Traceの結果を保存
     * @param {Object} traceResult - Optimizer Traceの結果
     * @param {string} queryName - クエリ名
     * @returns {string|null} 保存されたファイルパス
     */
    async saveOptimizerTrace(traceResult, queryName = 'query') {
        if (!this.config.enableDebugOutput || !traceResult) {
            return null;
        }

        try {
            this.fileCounter.optimizerTrace++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `optimizer-trace_${this.sanitizeFileName(queryName)}_${this.fileCounter.optimizerTrace}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'OPTIMIZER_TRACE',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.optimizerTrace
                },
                trace: traceResult.trace,
                timestamp: traceResult.timestamp
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 Optimizer Trace保存: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ Optimizer Trace保存エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * クエリプラン（EXPLAIN）の結果を保存
     * @param {Object} planResult - EXPLAIN結果
     * @param {string} queryName - クエリ名
     * @returns {string|null} 保存されたファイルパス
     */
    async saveQueryPlan(planResult, queryName = 'query') {
        if (!this.config.enableDebugOutput || !planResult) {
            return null;
        }

        try {
            this.fileCounter.queryPlan++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `query-plan_${this.sanitizeFileName(queryName)}_${this.fileCounter.queryPlan}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'QUERY_PLAN',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.queryPlan
                },
                plan: planResult
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 クエリプラン保存: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ クエリプラン保存エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * 一般的なデバッグ情報を保存
     * @param {Object} data - 保存するデータ
     * @param {string} name - ファイル名
     * @param {string} category - カテゴリ（オプション）
     * @returns {string|null} 保存されたファイルパス
     */
    async saveDebugInfo(data, name = 'debug', category = null) {
        if (!this.config.enableDebugOutput) {
            return null;
        }

        try {
            this.fileCounter.general++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const categoryPrefix = category ? `${category}_` : '';
            const fileName = `${categoryPrefix}${this.sanitizeFileName(name)}_${this.fileCounter.general}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    name,
                    category,
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.general
                },
                data
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 デバッグ情報保存: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ デバッグ情報保存エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * バッチでデバッグ情報を保存
     * @param {Object} batchData - バッチデータ { explainAnalyze, optimizerTrace, queryPlan, custom }
     * @param {string} queryName - クエリ名
     * @returns {Object} 保存されたファイルパスのマップ
     */
    async saveBatch(batchData, queryName = 'query') {
        if (!this.config.enableDebugOutput) {
            return {};
        }

        const results = {};

        if (batchData.explainAnalyze) {
            results.explainAnalyze = await this.saveExplainAnalyze(batchData.explainAnalyze, queryName);
        }

        if (batchData.optimizerTrace) {
            results.optimizerTrace = await this.saveOptimizerTrace(batchData.optimizerTrace, queryName);
        }

        if (batchData.queryPlan) {
            results.queryPlan = await this.saveQueryPlan(batchData.queryPlan, queryName);
        }

        if (batchData.custom) {
            const customResults = {};
            for (const [key, value] of Object.entries(batchData.custom)) {
                customResults[key] = await this.saveDebugInfo(value, `${queryName}_${key}`, 'custom');
            }
            results.custom = customResults;
        }

        return results;
    }

    /**
     * JSONファイルを書き込む
     * @param {string} filePath - ファイルパス
     * @param {Object} data - 書き込むデータ
     */
    async writeJsonFile(filePath, data) {
        const jsonString = JSON.stringify(data, null, 2);

        // ファイルサイズチェック
        if (Buffer.byteLength(jsonString, 'utf8') > this.config.maxFileSize) {
            console.warn(`⚠️ ファイルサイズが上限を超えています: ${filePath}`);
            // サイズオーバーの場合は圧縮版を保存
            const compactString = JSON.stringify(data);
            await fs.writeFile(filePath, compactString, 'utf8');
        } else {
            await fs.writeFile(filePath, jsonString, 'utf8');
        }
    }

    /**
     * タイムスタンプの生成
     * @returns {string} タイムスタンプ文字列
     */
    getTimestamp() {
        const now = new Date();
        return `_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
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
     * 出力ディレクトリのクリーンアップ
     * @param {number} maxAge - 最大保持日数（デフォルト7日）
     */
    async cleanup(maxAge = 7) {
        if (!this.config.enableDebugOutput) {
            return;
        }

        try {
            const files = await fs.readdir(this.config.outputDir);
            const now = Date.now();
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.config.outputDir, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️ ${deletedCount}個の古いファイルを削除しました`);
            }
        } catch (error) {
            console.warn(`⚠️ クリーンアップエラー: ${error.message}`);
        }
    }

    /**
     * サマリー情報の取得
     * @returns {Object} サマリー情報
     */
    getSummary() {
        return {
            outputDir: this.config.outputDir,
            enabled: this.config.enableDebugOutput,
            counters: { ...this.fileCounter },
            totalFiles: Object.values(this.fileCounter).reduce((a, b) => a + b, 0)
        };
    }

    /**
     * カウンターのリセット
     */
    resetCounters() {
        this.fileCounter = {
            explainAnalyze: 0,
            optimizerTrace: 0,
            queryPlan: 0,
            general: 0
        };
    }
}

export default FileManager;
