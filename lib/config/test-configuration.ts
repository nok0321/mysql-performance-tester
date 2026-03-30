/**
 * Test execution config factory
 *
 * createTestConfig() is the primary API.
 * TestConfiguration class is a thin wrapper for backward compatibility (deprecated).
 */

import type {
  TestConfig,
  TestConfigOptions,
  TestConfigValidation,
  FileManagerConfig,
} from '../types/index.js';

/**
 * Create a plain test execution config object
 */
export function createTestConfig(options: TestConfigOptions = {}): TestConfig {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    tableName:        options.tableName        || 'performance_table',
    testIterations:   options.testIterations   || 10,
    parallelThreads:  options.parallelThreads  || 5,
    skipParallelTests: options.skipParallelTests || false,

    sqlDirectory:     options.sqlDirectory     || './sql',
    parallelDirectory: options.parallelDirectory || './parallel',
    resultDirectory:  options.resultDirectory  || `./performance_results/${timestamp}`,

    enableWarmup:     options.enableWarmup !== false,
    warmupIterations: options.warmupIterations ?? null,
    warmupPercentage: options.warmupPercentage || 20,

    enableStatistics:  options.enableStatistics !== false,
    removeOutliers:    options.removeOutliers   || false,
    outlierMethod:     (options.outlierMethod as TestConfig['outlierMethod']) || 'iqr',

    enableOptimizerTrace:       options.enableOptimizerTrace       || false,
    enableExplainAnalyze:       options.enableExplainAnalyze       !== false,
    generateReport:             options.generateReport             !== false,
    enableBufferPoolMonitoring: options.enableBufferPoolMonitoring !== false,
    enablePerformanceSchema:    options.enablePerformanceSchema    !== false,
    clearCacheBeforeEachTest:   options.clearCacheBeforeEachTest   || false,

    fileManager: {
      enableDebugOutput: options.enableDebugOutput !== false,
      outputDir:         options.debugOutputDir    || './debug-output',
      enableTimestamp:   options.enableTimestamp   !== false,
      maxFileSize:       options.maxFileSize        || 50 * 1024 * 1024,
    },
  };
}

/**
 * Calculate warmup iterations count
 */
export function getWarmupIterations(testConfig: TestConfig): number {
  if (testConfig.warmupIterations !== null && testConfig.warmupIterations > 0) {
    return testConfig.warmupIterations;
  }
  return Math.ceil(testConfig.testIterations * testConfig.warmupPercentage / 100);
}

/**
 * Validate test config
 */
export function validateTestConfig(testConfig: TestConfig): TestConfigValidation {
  const errors: string[] = [];

  if (testConfig.testIterations < 1) {
    errors.push('testIterations must be at least 1');
  }
  if (testConfig.parallelThreads < 1) {
    errors.push('parallelThreads must be at least 1');
  }
  if (testConfig.warmupPercentage < 0 || testConfig.warmupPercentage > 100) {
    errors.push('warmupPercentage must be between 0 and 100');
  }
  if (!(['iqr', 'zscore', 'mad'] as const).includes(testConfig.outlierMethod)) {
    errors.push('outlierMethod must be one of: iqr, zscore, mad');
  }
  if (testConfig.fileManager.maxFileSize < 1024) {
    errors.push('maxFileSize must be at least 1024 bytes');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @deprecated Use createTestConfig() instead
 */
export class TestConfiguration implements TestConfig {
  tableName!: string;
  testIterations!: number;
  parallelThreads!: number;
  skipParallelTests!: boolean;
  sqlDirectory!: string;
  parallelDirectory!: string;
  resultDirectory!: string;
  enableWarmup!: boolean;
  warmupIterations!: number | null;
  warmupPercentage!: number;
  enableStatistics!: boolean;
  removeOutliers!: boolean;
  outlierMethod!: 'iqr' | 'zscore' | 'mad';
  enableOptimizerTrace!: boolean;
  enableExplainAnalyze!: boolean;
  generateReport!: boolean;
  enableBufferPoolMonitoring!: boolean;
  enablePerformanceSchema!: boolean;
  clearCacheBeforeEachTest!: boolean;
  fileManager!: FileManagerConfig;

  constructor(options: TestConfigOptions = {}) {
    Object.assign(this, createTestConfig(options));
  }

  getWarmupIterations(): number {
    return getWarmupIterations(this);
  }

  validate(): TestConfigValidation {
    return validateTestConfig(this);
  }

  clone(): TestConfiguration {
    const { fileManager, ...rest } = this;
    return new TestConfiguration({
      ...rest,
      enableDebugOutput: fileManager.enableDebugOutput,
      debugOutputDir:    fileManager.outputDir,
      enableTimestamp:   fileManager.enableTimestamp,
      maxFileSize:       fileManager.maxFileSize,
    });
  }

  toString(): string {
    return `TestConfiguration { testIterations: ${this.testIterations}, parallelThreads: ${this.parallelThreads} }`;
  }

  toObject(): { test: Omit<TestConfig, 'fileManager'>; fileManager: FileManagerConfig } {
    const { fileManager, ...test } = this;
    return { test, fileManager };
  }
}

export default createTestConfig;
