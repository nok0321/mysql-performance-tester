/**
 * Config Module - 設定モジュールの統合エクスポート
 *
 * プライマリ API（推奨）:
 *   import { createDbConfig, buildPoolConfig }         from './config/index.js';
 *   import { createTestConfig, getWarmupIterations }   from './config/index.js';
 *
 * 後方互換 API（非推奨）:
 *   import { DatabaseConfiguration, TestConfiguration } from './config/index.js';
 */

export {
  createDbConfig,
  buildPoolConfig,
  DatabaseConfiguration,
} from './database-configuration.js';

export {
  createTestConfig,
  getWarmupIterations,
  validateTestConfig,
  TestConfiguration,
} from './test-configuration.js';
