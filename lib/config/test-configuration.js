/**
 * テスト実行設定ファクトリ
 *
 * createTestConfig() がプライマリ API。
 * TestConfiguration クラスは後方互換性のための薄いラッパー（非推奨）。
 */

/**
 * テスト実行設定プレーンオブジェクトを生成
 * @param {Object} options
 * @returns {Object} testConfig
 */
export function createTestConfig(options = {}) {
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
    outlierMethod:     options.outlierMethod    || 'iqr',

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
 * ウォームアップ回数を計算
 * @param {Object} testConfig - createTestConfig() が返すプレーンオブジェクト
 * @returns {number}
 */
export function getWarmupIterations(testConfig) {
  if (testConfig.warmupIterations !== null && testConfig.warmupIterations > 0) {
    return testConfig.warmupIterations;
  }
  return Math.ceil(testConfig.testIterations * testConfig.warmupPercentage / 100);
}

/**
 * 設定の妥当性を検証
 * @param {Object} testConfig
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTestConfig(testConfig) {
  const errors = [];

  if (testConfig.testIterations < 1) {
    errors.push('testIterations must be at least 1');
  }
  if (testConfig.parallelThreads < 1) {
    errors.push('parallelThreads must be at least 1');
  }
  if (testConfig.warmupPercentage < 0 || testConfig.warmupPercentage > 100) {
    errors.push('warmupPercentage must be between 0 and 100');
  }
  if (!['iqr', 'zscore', 'mad'].includes(testConfig.outlierMethod)) {
    errors.push('outlierMethod must be one of: iqr, zscore, mad');
  }
  if (testConfig.fileManager.maxFileSize < 1024) {
    errors.push('maxFileSize must be at least 1024 bytes');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @deprecated createTestConfig() を使用してください
 */
export class TestConfiguration {
  constructor(options = {}) {
    Object.assign(this, createTestConfig(options));
  }

  getWarmupIterations() {
    return getWarmupIterations(this);
  }

  validate() {
    return validateTestConfig(this);
  }

  clone() {
    const { fileManager, ...rest } = this;
    return new TestConfiguration({
      ...rest,
      enableDebugOutput: fileManager.enableDebugOutput,
      debugOutputDir:    fileManager.outputDir,
      enableTimestamp:   fileManager.enableTimestamp,
      maxFileSize:       fileManager.maxFileSize,
    });
  }

  toString() {
    return `TestConfiguration { testIterations: ${this.testIterations}, parallelThreads: ${this.parallelThreads} }`;
  }

  toObject() {
    const { fileManager, ...test } = this;
    return { test, fileManager };
  }
}

export default createTestConfig;
