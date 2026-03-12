/**
 * DatabaseConnection - データベース接続管理
 *
 * MySQL接続プールの管理とデータベース操作を提供するクラス
 * - 接続プールの初期化
 * - サーバー機能の検出（バージョン、EXPLAIN ANALYZEサポート等）
 * - 接続テスト
 * - クエリ実行
 */

import mysql from 'mysql2/promise';
import { buildPoolConfig } from '../config/database-configuration.js';

export class DatabaseConnection {
    /**
     * データベース接続を初期化
     * @param {import('../config/database-configuration.js').DatabaseConfiguration} config - データベース設定
     */
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.serverVersion = null;
        this.supportsExplainAnalyze = false;
    }

    /**
     * 接続プールを初期化し、サーバー機能を検出
     * @returns {Promise<DatabaseConnection>} 自身のインスタンス
     */
    async initialize() {
        this.pool = mysql.createPool(buildPoolConfig(this.config));
        await this.detectServerCapabilities();
        return this;
    }

    /**
     * MySQLサーバーのバージョンと機能を検出
     * @returns {Promise<void>}
     */
    async detectServerCapabilities() {
        try {
            const [rows] = await this.pool.query('SELECT VERSION() as version');
            this.serverVersion = rows[0].version;

            // MySQL 8.0.18以降はEXPLAIN ANALYZEをサポート
            const versionMatch = this.serverVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
            if (versionMatch) {
                const [, major, minor, patch] = versionMatch.map(Number);
                this.supportsExplainAnalyze = (major > 8) ||
                    (major === 8 && minor > 0) ||
                    (major === 8 && minor === 0 && patch >= 18);
            }

            console.log(`MySQL Version: ${this.serverVersion}`);
            console.log(`EXPLAIN ANALYZE Support: ${this.supportsExplainAnalyze ? 'Yes' : 'No'}`);
        } catch (error) {
            console.warn('Failed to detect server capabilities:', error.message);
        }
    }

    /**
     * データベース接続をテスト
     * @param {number} [maxRetries=3]      - 最大リトライ回数
     *   デフォルトを 10→3 に削減。Web API 経由での呼び出しが最大 3秒 でタイムアウト前に完了する。
     *   Docker Compose 起動待ち等でより長いリトライが必要な場合は明示的に指定すること:
     *     db.testConnection(10, 2000)
     * @param {number} [retryDelayMs=1000] - リトライ間隔ミリ秒（旧固定2000→1000）
     * @returns {Promise<boolean>} 接続成功時true
     */
    async testConnection(maxRetries = 3, retryDelayMs = 1000) {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                const connection = await this.pool.getConnection();
                await connection.query('SELECT 1');
                connection.release();
                return true;
            } catch (error) {
                if (i === maxRetries) {
                    console.error(`Failed to connect to MySQL: ${error.message}`);
                    this.logConnectionErrors();
                    return false;
                }
                console.log(`Testing connection... (${i}/${maxRetries})`);
                await this.#sleep(retryDelayMs);
            }
        }
        return false;
    }

    /**
     * 接続エラー時のデバッグ情報を出力
     */
    logConnectionErrors() {
        console.error(`
Connection Check:
1. Verify database connection information:
   - Host: ${this.config.host}:${this.config.port}
   - Database: ${this.config.database}
   - User: ${this.config.user}
2. Check if MySQL server is running
3. Check firewall or security group settings
        `);
    }

    /**
     * 接続プールから接続を取得
     * @returns {Promise<import('mysql2/promise').PoolConnection>} プール接続
     */
    async getConnection() {
        return await this.pool.getConnection();
    }

    /**
     * プリペアドステートメントとしてクエリを実行
     * @param {string} query - SQLクエリ
     * @param {Array} [params=[]] - パラメータ
     * @returns {Promise<[Array, Array]>} 実行結果
     */
    async execute(query, params = []) {
        return await this.pool.execute(query, params);
    }

    /**
     * クエリを実行
     * @param {string} query - SQLクエリ
     * @returns {Promise<[Array, Array]>} 実行結果
     */
    async query(query) {
        return await this.pool.query(query);
    }

    /**
     * 接続プールを閉じる
     * @returns {Promise<void>}
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }

    /**
     * 指定ミリ秒待機（クラス内部専用）
     * @param {number} ms - 待機時間（ミリ秒）
     * @returns {Promise<void>}
     */
    #sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * サーバーバージョンを取得
     * @returns {string|null} サーバーバージョン
     */
    getServerVersion() {
        return this.serverVersion;
    }

    /**
     * EXPLAIN ANALYZEサポート状況を取得
     * @returns {boolean} サポート状況
     */
    isExplainAnalyzeSupported() {
        return this.supportsExplainAnalyze;
    }

    /**
     * 接続プールの状態を取得
     * @returns {Object|null} プールの状態情報
     */
    getPoolStatus() {
        if (!this.pool) {
            return null;
        }

        // mysql2 の内部プロパティ（_allConnections 等）はプライベートAPIのため使用しない。
        // connectionLimit は pool config から安全に参照する。
        try {
            const connectionLimit = this.pool.pool?.config?.connectionLimit ?? null;
            return { connectionLimit };
        } catch {
            return null;
        }
    }
}

export default DatabaseConnection;
