/**
 * Excelエクスポーター
 * Python連携でレポートデータをExcel形式でエクスポート
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BaseExporter } from './base-exporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Excelエクスポータークラス
 */
export class ExcelExporter extends BaseExporter {
    /**
     * レポートをExcelファイルとしてエクスポート
     * @param {Object} reportData - レポートデータ
     * @param {string} outputDir - 出力ディレクトリ
     * @returns {Promise<string>} 生成されたExcelファイルのパス
     */
    async export(reportData, outputDir) {
        await fs.mkdir(outputDir, { recursive: true });

        // 一時的にJSONファイルを保存
        const tempJsonPath = path.join(outputDir, 'temp-report.json');
        const excelPath = path.join(outputDir, 'analysis-report.xlsx');

        try {
            // JSONファイルを保存
            await fs.writeFile(tempJsonPath, JSON.stringify(reportData, null, 2), 'utf8');

            // Pythonスクリプトのパスを取得
            const pythonScriptPath = path.join(
                __dirname,
                '..',
                '..',
                '..',
                'scripts',
                'excel-generator.py'
            );

            // Pythonスクリプトを実行
            await this.executePythonScript(pythonScriptPath, tempJsonPath, excelPath);

            // 一時ファイルを削除
            await fs.unlink(tempJsonPath);

            return excelPath;
        } catch (error) {
            // エラー時も一時ファイルを削除
            try {
                await fs.unlink(tempJsonPath);
            } catch (unlinkError) {
                // 削除に失敗しても無視
            }
            throw error;
        }
    }

    /**
     * Pythonスクリプトを実行
     * @param {string} scriptPath - Pythonスクリプトのパス
     * @param {string} jsonPath - 入力JSONファイルのパス
     * @param {string} excelPath - 出力Excelファイルのパス
     * @returns {Promise<void>}
     */
    async executePythonScript(scriptPath, jsonPath, excelPath) {
        return new Promise((resolve, reject) => {
            // Pythonコマンドを実行（python3またはpythonを試す）
            const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

            const pythonProcess = spawn(pythonCommand, [scriptPath, jsonPath, excelPath]);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('Excel report generated successfully');
                    if (stdout) console.log(stdout);
                    resolve();
                } else {
                    const error = new Error(
                        `Python script failed with code ${code}\n${stderr}`
                    );
                    error.stdout = stdout;
                    error.stderr = stderr;
                    reject(error);
                }
            });

            pythonProcess.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    reject(new Error(
                        `Python not found. Please install Python and required packages (openpyxl).\n` +
                        `Error: ${error.message}`
                    ));
                } else {
                    reject(error);
                }
            });
        });
    }

    /**
     * Pythonとopenpyxlがインストールされているか確認
     * @returns {Promise<boolean>}
     */
    async checkPythonAvailability() {
        try {
            const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

            return new Promise((resolve) => {
                const pythonProcess = spawn(pythonCommand, ['-c', 'import openpyxl; print("OK")']);

                let output = '';

                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    resolve(code === 0 && output.includes('OK'));
                });

                pythonProcess.on('error', () => {
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * Excel生成の利用可能性を確認し、メッセージを返す
     * @returns {Promise<Object>} {available: boolean, message: string}
     */
    async getAvailabilityStatus() {
        const available = await this.checkPythonAvailability();

        if (available) {
            return {
                available: true,
                message: 'Excel export is available'
            };
        } else {
            return {
                available: false,
                message: 'Excel export requires Python and openpyxl package.\n' +
                    'Install with: pip install openpyxl'
            };
        }
    }
}
