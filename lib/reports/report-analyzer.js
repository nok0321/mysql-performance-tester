/**
 * レポート分析クラス
 * テスト結果の分析とメトリクスの評価
 */

/**
 * レポート分析クラス
 */
export class ReportAnalyzer {
    constructor(testResults, config) {
        this.testResults = testResults;
        this.config = config;
    }

    /**
     * テスト結果全体のサマリーを生成
     */
    generateSummary() {
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(t =>
            (t.statistics && t.statistics.count.included > 0) ||
            (t.parallelResults && t.parallelResults.metrics)
        ).length;

        // 全テストの統計を集計
        const allDurations = [];
        const allP95s = [];
        const allQPS = [];

        this.testResults.forEach(test => {
            if (test.rawDurations && test.rawDurations.length > 0) {
                allDurations.push(...test.rawDurations);
            }
            if (test.statistics && test.statistics.percentiles) {
                allP95s.push(test.statistics.percentiles.p95);
            }
            // 並列テスト結果からQPSを取得
            if (test.parallelResults && test.parallelResults.metrics) {
                if (test.parallelResults.metrics.throughput) {
                    allQPS.push(test.parallelResults.metrics.throughput.qps);
                }
                // 並列テストのP95も集計
                if (test.parallelResults.metrics.latency && test.parallelResults.metrics.latency.percentiles) {
                    allP95s.push(test.parallelResults.metrics.latency.percentiles.p95);
                }
            }
        });

        return {
            testCount: {
                total: totalTests,
                successful: successfulTests,
                failed: totalTests - successfulTests
            },
            overallMetrics: {
                totalQueries: allDurations.length,
                averageP95: allP95s.length > 0
                    ? (allP95s.reduce((a, b) => a + b, 0) / allP95s.length).toFixed(3)
                    : null,
                maxQPS: allQPS.length > 0
                    ? Math.max(...allQPS).toFixed(2)
                    : null,
                avgQPS: allQPS.length > 0
                    ? (allQPS.reduce((a, b) => a + b, 0) / allQPS.length).toFixed(2)
                    : null
            },
            performanceGrade: this.calculatePerformanceGrade(allP95s)
        };
    }

    /**
     * 個別テスト結果の詳細分析
     */
    analyzeTestResult(testResult) {
        const analysis = {
            testName: testResult.testName,
            query: testResult.query,
            timestamp: testResult.timestamp
        };

        // 並列テスト結果の処理
        if (testResult.parallelResults) {
            analysis.isParallelTest = true;
            analysis.parallelMetrics = this.analyzeParallelResults(testResult.parallelResults);
        }

        // 統計分析
        if (testResult.statistics) {
            analysis.statistics = {
                ...testResult.statistics,
                grade: this.gradeLatency(testResult.statistics.percentiles.p95),
                interpretation: this.interpretStatistics(testResult.statistics)
            };
        }

        // ウォームアップ効果の分析
        if (testResult.warmupResult && testResult.warmupResult.cacheEffectiveness) {
            analysis.warmupEffectiveness = {
                ...testResult.warmupResult.cacheEffectiveness,
                interpretation: this.interpretWarmupEffectiveness(
                    testResult.warmupResult.cacheEffectiveness
                )
            };
        }

        // Buffer Pool分析
        if (testResult.bufferPoolAnalysis) {
            analysis.bufferPool = {
                ...testResult.bufferPoolAnalysis.metrics,
                grade: this.gradeBufferPoolHitRatio(
                    testResult.bufferPoolAnalysis.metrics.hitRatio
                ),
                interpretation: this.interpretBufferPool(
                    testResult.bufferPoolAnalysis.metrics
                )
            };
        }

        // Performance Schema分析
        if (testResult.performanceSchemaMetrics) {
            analysis.performanceSchema = this.analyzePerformanceSchema(
                testResult.performanceSchemaMetrics
            );
        }

        // EXPLAIN分析
        if (testResult.explainAnalyze) {
            analysis.queryPlan = this.analyzeQueryPlan(testResult.explainAnalyze);
        }

        return analysis;
    }

    /**
     * 並列テスト結果の分析
     */
    analyzeParallelResults(parallelResults) {
        const metrics = parallelResults.metrics;

        return {
            strategy: parallelResults.strategy,
            duration: metrics.duration,
            queries: metrics.queries,
            throughput: {
                ...metrics.throughput,
                grade: this.gradeThroughput(metrics.throughput.qps),
                interpretation: this.interpretThroughput(metrics.throughput)
            },
            latency: {
                ...metrics.latency,
                grade: this.gradeLatency(metrics.latency.percentiles.p95),
                interpretation: this.interpretParallelLatency(metrics.latency)
            },
            perFile: metrics.perFile || {}
        };
    }

    /**
     * 統計の解釈
     */
    interpretStatistics(stats) {
        const interpretation = [];

        // 変動係数の評価
        if (stats.spread.cv < 10) {
            interpretation.push('実行時間が非常に安定しています');
        } else if (stats.spread.cv < 20) {
            interpretation.push('実行時間は比較的安定しています');
        } else if (stats.spread.cv < 30) {
            interpretation.push('実行時間にやや変動があります');
        } else {
            interpretation.push('実行時間が不安定です。システム負荷やネットワークを確認してください');
        }

        // P95とP50の比較
        const p95p50Ratio = stats.percentiles.p95 / stats.percentiles.p50;
        if (p95p50Ratio > 2) {
            interpretation.push('P95がP50の2倍以上です。一部のクエリで顕著な遅延が発生しています');
        }

        // 外れ値の評価
        if (stats.outliers && stats.outliers.count > 0) {
            const outlierPct = stats.outliers.percentage;
            if (outlierPct > 10) {
                interpretation.push(`外れ値が${outlierPct}%と多すぎます。システムに問題がある可能性があります`);
            } else if (outlierPct > 5) {
                interpretation.push(`外れ値が${outlierPct}%検出されました`);
            } else {
                interpretation.push(`外れ値は${outlierPct}%と正常範囲です`);
            }
        }

        return interpretation;
    }

    /**
     * 並列テストのレイテンシ解釈
     */
    interpretParallelLatency(latency) {
        const interpretation = [];

        // CV（変動係数）の評価
        if (latency.spread.cv < 30) {
            interpretation.push('レイテンシが安定しています');
        } else if (latency.spread.cv < 50) {
            interpretation.push('レイテンシにやや変動があります');
        } else {
            interpretation.push('レイテンシが不安定です');
        }

        // P95とP50の比較
        const p95p50Ratio = latency.percentiles.p95 / latency.percentiles.p50;
        if (p95p50Ratio > 3) {
            interpretation.push('P95がP50の3倍以上です。一部のリクエストで顕著な遅延が発生しています');
        } else if (p95p50Ratio > 2) {
            interpretation.push('P95とP50に差があります');
        }

        // P99の評価
        if (latency.percentiles.p99 > latency.percentiles.p95 * 2) {
            interpretation.push('P99が非常に高いです。外れ値的な遅延が発生しています');
        }

        return interpretation;
    }

    /**
     * スループットの解釈
     */
    interpretThroughput(throughput) {
        const interpretation = [];
        const qps = throughput.qps;

        if (qps >= 5000) {
            interpretation.push('非常に高いスループットを達成しています');
        } else if (qps >= 3000) {
            interpretation.push('良好なスループットです');
        } else if (qps >= 1000) {
            interpretation.push('中程度のスループットです。最適化の余地があります');
        } else {
            interpretation.push('スループットが低いです。最適化が必要です');
        }

        const effectiveQps = throughput.effectiveQps;
        if (effectiveQps > qps * 1.2) {
            interpretation.push('実効スループットが高く、並列処理が効果的です');
        }

        return interpretation;
    }

    /**
     * ウォームアップ効果の解釈
     */
    interpretWarmupEffectiveness(effectiveness) {
        const interpretation = [];
        const improvement = effectiveness.improvementPercentage;

        if (improvement > 30) {
            interpretation.push('キャッシュ効果が非常に高く、ウォームアップが効果的です');
            interpretation.push('本番環境でも事前ウォーミングを推奨');
        } else if (improvement > 10) {
            interpretation.push('適度なキャッシュ効果があります');
        } else if (improvement > 0) {
            interpretation.push('キャッシュ効果が限定的です');
            interpretation.push('Buffer Pool設定やクエリの最適化を検討してください');
        } else {
            interpretation.push('キャッシュ効果が見られません');
            interpretation.push('データベースのキャッシュ設定を確認してください');
        }

        return interpretation;
    }

    /**
     * Buffer Poolの解釈
     */
    interpretBufferPool(metrics) {
        const interpretation = [];
        const hitRatio = metrics.hitRatio;

        if (hitRatio >= 99) {
            interpretation.push('Buffer Poolヒット率が非常に高く、最適です');
        } else if (hitRatio >= 95) {
            interpretation.push('Buffer Poolヒット率は良好です');
        } else if (hitRatio >= 90) {
            interpretation.push('Buffer Poolヒット率がやや低めです');
            interpretation.push('innodb_buffer_pool_sizeの増加を検討してください');
        } else {
            interpretation.push('Buffer Poolヒット率が低すぎます');
            interpretation.push('至急、Buffer Pool設定を見直してください');
        }

        const freePercentage = (metrics.pagesFree / metrics.pagesTotal) * 100;
        if (freePercentage < 5) {
            interpretation.push('Buffer Poolの空きページが少なくなっています');
        }

        return interpretation;
    }

    /**
     * Performance Schemaの分析
     */
    analyzePerformanceSchema(metrics) {
        const analysis = {};

        // 接続統計
        if (metrics.connections) {
            const conn = metrics.connections;
            analysis.connections = {
                ...conn,
                interpretation: []
            };

            if (conn.Threads_running > conn.Threads_connected * 0.5) {
                analysis.connections.interpretation.push(
                    '実行中のスレッドが多すぎます。システムが過負荷の可能性があります'
                );
            }

            if (conn.Aborted_connects > 0) {
                analysis.connections.interpretation.push(
                    `接続中断が${conn.Aborted_connects}件発生しています`
                );
            }
        }

        // トップクエリ
        if (metrics.topQueries && metrics.topQueries.length > 0) {
            analysis.slowQueries = metrics.topQueries.slice(0, 5).map(q => ({
                ...q,
                needsOptimization: q.avgLatency > 100 || q.rowsExamined > 1000
            }));
        }

        // テーブルスキャン
        if (metrics.tableScans && metrics.tableScans.length > 0) {
            analysis.fullTableScans = metrics.tableScans;
            analysis.fullTableScans.interpretation = [
                'フルテーブルスキャンが検出されました',
                '適切なインデックスの追加を検討してください'
            ];
        }

        return analysis;
    }

    /**
     * クエリプランの分析
     */
    analyzeQueryPlan(explainData) {
        const analysis = {
            hasIssues: false,
            issues: [],
            recommendations: []
        };

        // EXPLAIN ANALYZEデータがある場合
        if (explainData.analyze && explainData.analyze.tree) {
            const tree = explainData.analyze.tree;

            if (tree.includes('Full scan')) {
                analysis.hasIssues = true;
                analysis.issues.push('フルテーブルスキャンが発生');
                analysis.recommendations.push('インデックスの追加を検討');
            }

            if (tree.includes('Using temporary')) {
                analysis.hasIssues = true;
                analysis.issues.push('一時テーブルを使用');
                analysis.recommendations.push('GROUP BYやORDER BYの最適化を検討');
            }

            if (tree.includes('Using filesort')) {
                analysis.hasIssues = true;
                analysis.issues.push('ファイルソートを使用');
                analysis.recommendations.push('適切なインデックスでソートを回避');
            }
        }

        // 標準EXPLAINデータの分析
        if (explainData.data && explainData.data.query_block) {
            const queryBlock = explainData.data.query_block;

            if (queryBlock.table) {
                const table = queryBlock.table;

                if (table.access_type === 'ALL') {
                    analysis.hasIssues = true;
                    analysis.issues.push('アクセスタイプがALL（フルスキャン）');
                }

                if (table.rows_examined_per_scan > 10000) {
                    analysis.hasIssues = true;
                    analysis.issues.push(`スキャン行数が多い（${table.rows_examined_per_scan}行）`);
                }
            }
        }

        return analysis;
    }

    /**
     * パフォーマンスグレードの計算
     */
    calculatePerformanceGrade(p95Values) {
        if (p95Values.length === 0) return 'N/A';

        const avgP95 = p95Values.reduce((a, b) => a + b, 0) / p95Values.length;

        if (avgP95 < 10) return 'A+ (Excellent)';
        if (avgP95 < 50) return 'A (Very Good)';
        if (avgP95 < 100) return 'B (Good)';
        if (avgP95 < 200) return 'C (Fair)';
        if (avgP95 < 500) return 'D (Poor)';
        return 'F (Critical)';
    }

    /**
     * レイテンシのグレード評価
     */
    gradeLatency(p95) {
        if (p95 < 10) return 'A+';
        if (p95 < 50) return 'A';
        if (p95 < 100) return 'B';
        if (p95 < 200) return 'C';
        if (p95 < 500) return 'D';
        return 'F';
    }

    /**
     * スループットの評価
     */
    gradeThroughput(qps) {
        if (qps >= 5000) return 'A+';
        if (qps >= 3000) return 'A';
        if (qps >= 1000) return 'B';
        if (qps >= 500) return 'C';
        return 'D';
    }

    /**
     * Buffer Poolヒット率のグレード評価
     */
    gradeBufferPoolHitRatio(hitRatio) {
        if (hitRatio >= 99) return 'A+';
        if (hitRatio >= 95) return 'A';
        if (hitRatio >= 90) return 'B';
        if (hitRatio >= 85) return 'C';
        if (hitRatio >= 80) return 'D';
        return 'F';
    }
}
