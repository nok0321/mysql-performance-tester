# データモデル

## コア型（lib/types/index.ts）

```typescript
// テスト設定
DbConfig { host, port, user, password, database, connectionLimit, ... }
TestConfig { testIterations, parallelThreads, enableWarmup, outlierMethod, ... }

// テスト結果
TestResult { query, durations[], statistics, warmup?, explain?, recommendations? }
StatisticsResult { basic, spread, percentiles, distribution, outlierInfo? }
ParallelMetrics { totalQueries, successCount, qps, duration, latencyPercentiles }

// クエリ分析
ExplainResult { queryPlan, warnings[] }
ExplainAnalyzeResult { data, format, executionPlan }
BufferPoolMetrics { hitRatio, readRequests, reads, pages }
PerformanceSchemaMetrics { bufferPool, recentQueries, topWaits, ... }

// クエリ履歴
QueryTimeline { fingerprint, sql, entries[], events[] }
QueryEvent { id, fingerprint, type, description, timestamp }
```

## フロントエンド型（web-ui/src/types/index.ts）

- バックエンド型のミラーリング + UI 固有の型
- `Connection` / `ConnectionFormData` の分離（表示用 vs フォーム用）
- `RunState` / `RunAction` — Reducer パターン用

---

# 統計エンジン

## パーセンタイル計算

```
P01, P05, P10, P25 (Q1), P50 (Median), P75 (Q3),
P90, P95, P99, P99.5, P99.9

Method: Linear interpolation between sorted values
```

## 外れ値検出（3手法）

| 手法 | アルゴリズム | 適する用途 |
|------|-------------|-----------|
| **IQR** | Q1 - 1.5×IQR ~ Q3 + 1.5×IQR | 一般的なケース（推奨） |
| **Z-score** | \|z\| > 3.0 | 正規分布に近いデータ |
| **MAD** | Modified Z-score > 3.5 | 外れ値が多いデータ |

## ウォームアップ

```
Total iterations = Warmup iterations + Measuring iterations
Warmup % = configurable (default 20%)

Warmup phase:  Execute queries to populate Buffer Pool / query cache
Measuring:     Collect durations for statistical analysis
```
