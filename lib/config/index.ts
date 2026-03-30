/**
 * Config Module - Unified export for configuration modules
 *
 * Primary API (recommended):
 *   import { createDbConfig, buildPoolConfig }         from './config/index.js';
 *   import { createTestConfig, getWarmupIterations }   from './config/index.js';
 *
 * Legacy API (deprecated):
 *   import { TestConfiguration } from './config/index.js';
 */

export {
  createDbConfig,
  buildPoolConfig,
} from './database-configuration.js';

export {
  createTestConfig,
  getWarmupIterations,
  validateTestConfig,
  TestConfiguration,
} from './test-configuration.js';
