/**
 * Base analyzer class
 * Defines the contract that all DB query analyzers in lib/analyzers/ must implement
 */

import type { DatabaseConnection } from '../core/database-connection.js';
import type { TestConfig } from '../types/index.js';

export class BaseAnalyzer {
    protected connection: DatabaseConnection;
    protected config: TestConfig;

    /**
     * @param connection - DatabaseConnection instance
     * @param config - Plain object returned by createTestConfig()
     */
    constructor(connection: DatabaseConnection, config: TestConfig) {
        if (new.target === BaseAnalyzer) {
            throw new Error('BaseAnalyzer は抽象クラスです。直接インスタンス化できません');
        }
        this.connection = connection;
        this.config = config;
    }
}
