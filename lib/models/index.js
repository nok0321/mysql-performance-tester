/**
 * Models Module - データモデル層の統合エクスポート
 *
 * すべてのモデルクラスを一箇所から参照できるようにする
 *
 * 使用例:
 *   import { TestResult, TestMetrics, AnalysisReport } from './models/index.js';
 *
 * @module models
 */

export { TestResult } from './test-result.js';
export { TestMetrics } from './test-metrics.js';
export { AnalysisReport } from './analysis-report.js';

// デフォルトエクスポート（名前付きインポートを推奨）
export default {
    TestResult,
    TestMetrics,
    AnalysisReport
};
