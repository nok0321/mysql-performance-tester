import { describe, it, expect } from 'vitest';
import {
  createTestConfig,
  validateTestConfig,
  getWarmupIterations,
} from '../../lib/config/test-configuration.js';

describe('createTestConfig', () => {
  it('should return all default values when called with no arguments', () => {
    const config = createTestConfig();

    expect(config.tableName).toBe('performance_table');
    expect(config.testIterations).toBe(10);
    expect(config.parallelThreads).toBe(5);
    expect(config.skipParallelTests).toBe(false);
    expect(config.sqlDirectory).toBe('./sql');
    expect(config.parallelDirectory).toBe('./parallel');
    expect(config.resultDirectory).toMatch(/^\.\/performance_results\//);
    expect(config.enableWarmup).toBe(true);
    expect(config.warmupIterations).toBeNull();
    expect(config.warmupPercentage).toBe(20);
    expect(config.enableStatistics).toBe(true);
    expect(config.removeOutliers).toBe(false);
    expect(config.outlierMethod).toBe('iqr');
    expect(config.enableOptimizerTrace).toBe(false);
    expect(config.enableExplainAnalyze).toBe(true);
    expect(config.generateReport).toBe(true);
    expect(config.enableBufferPoolMonitoring).toBe(true);
    expect(config.enablePerformanceSchema).toBe(true);
    expect(config.clearCacheBeforeEachTest).toBe(false);
  });

  it('should return default fileManager config', () => {
    const config = createTestConfig();

    expect(config.fileManager.enableDebugOutput).toBe(true);
    expect(config.fileManager.outputDir).toBe('./debug-output');
    expect(config.fileManager.enableTimestamp).toBe(true);
    expect(config.fileManager.maxFileSize).toBe(50 * 1024 * 1024);
  });

  it('should override defaults with provided options', () => {
    const config = createTestConfig({
      tableName: 'custom_table',
      testIterations: 100,
      parallelThreads: 20,
      skipParallelTests: true,
      sqlDirectory: './custom-sql',
      parallelDirectory: './custom-parallel',
      enableWarmup: false,
      warmupIterations: 5,
      warmupPercentage: 50,
      enableStatistics: false,
      removeOutliers: true,
      outlierMethod: 'zscore',
      enableOptimizerTrace: true,
      enableExplainAnalyze: false,
      generateReport: false,
      enableBufferPoolMonitoring: false,
      enablePerformanceSchema: false,
      clearCacheBeforeEachTest: true,
    });

    expect(config.tableName).toBe('custom_table');
    expect(config.testIterations).toBe(100);
    expect(config.parallelThreads).toBe(20);
    expect(config.skipParallelTests).toBe(true);
    expect(config.sqlDirectory).toBe('./custom-sql');
    expect(config.parallelDirectory).toBe('./custom-parallel');
    expect(config.enableWarmup).toBe(false);
    expect(config.warmupIterations).toBe(5);
    expect(config.warmupPercentage).toBe(50);
    expect(config.enableStatistics).toBe(false);
    expect(config.removeOutliers).toBe(true);
    expect(config.outlierMethod).toBe('zscore');
    expect(config.enableOptimizerTrace).toBe(true);
    expect(config.enableExplainAnalyze).toBe(false);
    expect(config.generateReport).toBe(false);
    expect(config.enableBufferPoolMonitoring).toBe(false);
    expect(config.enablePerformanceSchema).toBe(false);
    expect(config.clearCacheBeforeEachTest).toBe(true);
  });

  it('should override fileManager options', () => {
    const config = createTestConfig({
      enableDebugOutput: false,
      debugOutputDir: './my-debug',
      enableTimestamp: false,
      maxFileSize: 1024,
    });

    expect(config.fileManager.enableDebugOutput).toBe(false);
    expect(config.fileManager.outputDir).toBe('./my-debug');
    expect(config.fileManager.enableTimestamp).toBe(false);
    expect(config.fileManager.maxFileSize).toBe(1024);
  });

  it('should generate a timestamp-based resultDirectory', () => {
    const config = createTestConfig();
    // Format: ./performance_results/YYYY-MM-DDTHH-MM-SS
    expect(config.resultDirectory).toMatch(
      /^\.\/performance_results\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/
    );
  });
});

describe('validateTestConfig', () => {
  it('should return valid for default config', () => {
    const config = createTestConfig();
    const result = validateTestConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject testIterations < 1', () => {
    const config = createTestConfig({ testIterations: 1 });
    // Override to invalid value after creation
    config.testIterations = 0;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('testIterations must be at least 1');
  });

  it('should reject parallelThreads < 1', () => {
    const config = createTestConfig();
    config.parallelThreads = 0;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('parallelThreads must be at least 1');
  });

  it('should reject warmupPercentage < 0', () => {
    const config = createTestConfig();
    config.warmupPercentage = -1;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('warmupPercentage must be between 0 and 100');
  });

  it('should reject warmupPercentage > 100', () => {
    const config = createTestConfig();
    config.warmupPercentage = 101;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('warmupPercentage must be between 0 and 100');
  });

  it('should accept warmupPercentage boundary values 0 and 100', () => {
    const config0 = createTestConfig();
    config0.warmupPercentage = 0;
    expect(validateTestConfig(config0).valid).toBe(true);

    const config100 = createTestConfig();
    config100.warmupPercentage = 100;
    expect(validateTestConfig(config100).valid).toBe(true);
  });

  it('should reject invalid outlierMethod', () => {
    const config = createTestConfig();
    (config as Record<string, unknown>).outlierMethod = 'invalid';
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('outlierMethod must be one of: iqr, zscore, mad');
  });

  it('should accept all valid outlierMethod values', () => {
    for (const method of ['iqr', 'zscore', 'mad'] as const) {
      const config = createTestConfig({ outlierMethod: method });
      expect(validateTestConfig(config).valid).toBe(true);
    }
  });

  it('should reject maxFileSize < 1024', () => {
    const config = createTestConfig();
    config.fileManager.maxFileSize = 512;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxFileSize must be at least 1024 bytes');
  });

  it('should accept maxFileSize = 1024 (boundary)', () => {
    const config = createTestConfig({ maxFileSize: 1024 });
    expect(validateTestConfig(config).valid).toBe(true);
  });

  it('should collect multiple errors at once', () => {
    const config = createTestConfig();
    config.testIterations = 0;
    config.parallelThreads = 0;
    config.warmupPercentage = -5;
    const result = validateTestConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('should accept testIterations = 1 (boundary)', () => {
    const config = createTestConfig({ testIterations: 1 });
    expect(validateTestConfig(config).valid).toBe(true);
  });

  it('should accept parallelThreads = 1 (boundary)', () => {
    const config = createTestConfig({ parallelThreads: 1 });
    expect(validateTestConfig(config).valid).toBe(true);
  });
});

describe('getWarmupIterations', () => {
  it('should use explicit warmupIterations when set', () => {
    const config = createTestConfig({ warmupIterations: 7 });
    expect(getWarmupIterations(config)).toBe(7);
  });

  it('should calculate from percentage when warmupIterations is null', () => {
    // testIterations=10, warmupPercentage=20 => ceil(10*20/100) = 2
    const config = createTestConfig({ testIterations: 10, warmupPercentage: 20 });
    expect(getWarmupIterations(config)).toBe(2);
  });

  it('should ceil the calculated value', () => {
    // testIterations=7, warmupPercentage=30 => ceil(7*30/100) = ceil(2.1) = 3
    const config = createTestConfig({ testIterations: 7 });
    config.warmupPercentage = 30;
    expect(getWarmupIterations(config)).toBe(3);
  });

  it('should return 0 when warmupPercentage is 0', () => {
    // warmupPercentage uses || so 0 falls back to default 20;
    // must override after creation to test the calculation with 0
    const config = createTestConfig();
    config.warmupPercentage = 0;
    expect(getWarmupIterations(config)).toBe(0);
  });

  it('should fall back to percentage when warmupIterations is 0', () => {
    // warmupIterations=0 is not > 0, so falls back to percentage
    const config = createTestConfig({ testIterations: 10, warmupPercentage: 20 });
    config.warmupIterations = 0;
    expect(getWarmupIterations(config)).toBe(2);
  });

  it('should fall back to percentage when warmupIterations is negative', () => {
    const config = createTestConfig({ testIterations: 10, warmupPercentage: 50 });
    config.warmupIterations = -3;
    expect(getWarmupIterations(config)).toBe(5);
  });

  it('should handle large testIterations', () => {
    const config = createTestConfig({ testIterations: 1000, warmupPercentage: 10 });
    expect(getWarmupIterations(config)).toBe(100);
  });

  it('should handle warmupPercentage of 100', () => {
    const config = createTestConfig({ testIterations: 10, warmupPercentage: 100 });
    expect(getWarmupIterations(config)).toBe(10);
  });
});
