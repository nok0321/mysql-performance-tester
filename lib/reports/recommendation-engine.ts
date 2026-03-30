/**
 * Recommendation Engine
 * Generates recommendations based on test results
 */

interface RecommendationItem {
    priority: string;
    category: string;
    title: string;
    description: string;
    actions: string[];
}

interface ReportDetail {
    testName?: string;
    isParallelTest?: boolean;
    bufferPool?: {
        hitRatio: number;
        [key: string]: unknown;
    };
    warmupEffectiveness?: {
        improvementPercentage: number;
        [key: string]: unknown;
    };
    performanceSchema?: {
        fullTableScans?: unknown[];
        [key: string]: unknown;
    };
    queryPlan?: {
        hasIssues?: boolean;
        [key: string]: unknown;
    };
    statistics?: {
        spread?: {
            cv: number;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    parallelMetrics?: {
        strategy?: string;
        throughput?: {
            qps: number;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface ReportSummary {
    overallMetrics: {
        averageP95: string | null;
        maxQPS: string | null;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface InternalReportData {
    summary: ReportSummary;
    details: ReportDetail[];
    recommendations?: RecommendationItem[];
    [key: string]: unknown;
}

/**
 * Recommendation engine class
 */
export class RecommendationEngine {
    reportData: InternalReportData;

    constructor(reportData: InternalReportData) {
        this.reportData = reportData;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];

        // Latency recommendations
        recommendations.push(...this.analyzeLatency());

        // Throughput recommendations
        recommendations.push(...this.analyzeThroughput());

        // Buffer Pool recommendations
        recommendations.push(...this.analyzeBufferPool());

        // Warmup recommendations
        recommendations.push(...this.analyzeWarmup());

        // Indexing recommendations
        recommendations.push(...this.analyzeIndexing());

        // Consistency recommendations
        recommendations.push(...this.analyzeConsistency());

        return recommendations;
    }

    /**
     * Analyze latency
     */
    analyzeLatency(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const avgP95 = this.reportData.summary.overallMetrics.averageP95;

        if (avgP95 && parseFloat(avgP95) > 100) {
            recommendations.push({
                priority: 'high',
                category: 'performance',
                title: 'レイテンシの改善が必要',
                description: `平均P95レイテンシが${avgP95}msと高めです`,
                actions: [
                    'インデックスの最適化',
                    'クエリの見直し',
                    'Buffer Pool設定の調整',
                    'ハードウェアリソースの増強を検討'
                ]
            });
        } else if (avgP95 && parseFloat(avgP95) > 50) {
            recommendations.push({
                priority: 'medium',
                category: 'performance',
                title: 'レイテンシの最適化を推奨',
                description: `平均P95レイテンシが${avgP95}msです。更なる最適化の余地があります`,
                actions: [
                    'クエリプランの確認',
                    'インデックスの見直し',
                    'キャッシュ戦略の最適化'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze throughput
     */
    analyzeThroughput(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const maxQPS = parseFloat(this.reportData.summary.overallMetrics.maxQPS || '0');

        if (maxQPS && maxQPS < 1000) {
            recommendations.push({
                priority: 'high',
                category: 'performance',
                title: 'スループットの改善が必要',
                description: `最大QPS が${maxQPS}と低いです`,
                actions: [
                    '接続プールの設定見直し',
                    'クエリの最適化',
                    'データベースサーバーのリソース増強',
                    '並列実行の最適化'
                ]
            });
        } else if (maxQPS && maxQPS < 3000) {
            recommendations.push({
                priority: 'medium',
                category: 'performance',
                title: 'スループットの最適化を推奨',
                description: `最大QPSが${maxQPS}です。更なる改善が可能です`,
                actions: [
                    '並列度の調整',
                    'コネクション管理の最適化',
                    'クエリキャッシュの活用'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze Buffer Pool
     */
    analyzeBufferPool(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const bufferPoolIssues = this.reportData.details.filter(d =>
            d.bufferPool && d.bufferPool.hitRatio < 95
        );

        if (bufferPoolIssues.length > 0) {
            const avgHitRatio = bufferPoolIssues.reduce((sum, d) => sum + d.bufferPool!.hitRatio, 0) / bufferPoolIssues.length;

            recommendations.push({
                priority: avgHitRatio < 90 ? 'high' : 'medium',
                category: 'configuration',
                title: 'Buffer Poolヒット率の改善',
                description: `${bufferPoolIssues.length}件のテストでBuffer Poolヒット率が低い（平均: ${avgHitRatio.toFixed(2)}%）`,
                actions: [
                    'innodb_buffer_pool_sizeを増やす',
                    '推奨値: 物理メモリの50-80%',
                    'Buffer Pool Instancesの調整を検討',
                    'ワーキングセットサイズの確認'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze warmup
     */
    analyzeWarmup(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const needsWarmup = this.reportData.details.filter(d =>
            d.warmupEffectiveness &&
            d.warmupEffectiveness.improvementPercentage > 20
        );

        if (needsWarmup.length > 0) {
            const avgImprovement = needsWarmup.reduce(
                (sum, d) => sum + d.warmupEffectiveness!.improvementPercentage, 0
            ) / needsWarmup.length;

            recommendations.push({
                priority: avgImprovement > 30 ? 'high' : 'medium',
                category: 'practice',
                title: 'ウォームアップの実装',
                description: `キャッシュ効果が高い（平均改善率: ${avgImprovement.toFixed(2)}%）ため、本番環境でもウォームアップを推奨`,
                actions: [
                    'アプリケーション起動時にウォームアップクエリを実行',
                    '頻繁にアクセスされるデータを事前ロード',
                    'ウォームアップスクリプトの自動化',
                    'データベース再起動後のウォームアップ手順の文書化'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze indexing
     */
    analyzeIndexing(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const needsIndex = this.reportData.details.filter(d =>
            (d.performanceSchema && d.performanceSchema.fullTableScans &&
                d.performanceSchema.fullTableScans.length > 0) ||
            (d.queryPlan && d.queryPlan.hasIssues)
        );

        if (needsIndex.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'optimization',
                title: 'インデックスの追加',
                description: `${needsIndex.length}件のテストでフルテーブルスキャンまたはクエリプランの問題が検出されました`,
                actions: [
                    'WHERE句の列にインデックスを追加',
                    'JOIN条件の列にインデックスを追加',
                    'EXPLAIN ANALYZEで実行計画を確認',
                    '複合インデックスの検討',
                    '不要なインデックスの削除'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze consistency
     */
    analyzeConsistency(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const inconsistentTests = this.reportData.details.filter(d =>
            d.statistics && d.statistics.spread && d.statistics.spread.cv > 30
        );

        if (inconsistentTests.length > 0) {
            const avgCV = inconsistentTests.reduce(
                (sum, d) => sum + d.statistics!.spread!.cv, 0
            ) / inconsistentTests.length;

            recommendations.push({
                priority: avgCV > 50 ? 'high' : 'medium',
                category: 'stability',
                title: 'パフォーマンスの一貫性向上',
                description: `${inconsistentTests.length}件のテストで実行時間の変動が大きい（平均CV: ${avgCV.toFixed(2)}%）`,
                actions: [
                    'システムリソースの競合を確認',
                    'ネットワークの安定性を確認',
                    'データベースサーバーの負荷状況を監視',
                    'クエリキャッシュの有効性を確認',
                    'スロークエリログの分析'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Analyze parallel execution
     */
    analyzeParallelExecution(): RecommendationItem[] {
        const recommendations: RecommendationItem[] = [];
        const parallelTests = this.reportData.details.filter(d => d.isParallelTest);

        if (parallelTests.length > 0) {
            // Compare strategies
            const strategies: Record<string, Array<{ throughput?: { qps: number } }>> = {};
            parallelTests.forEach(test => {
                const strategy = test.parallelMetrics?.strategy;
                if (strategy) {
                    if (!strategies[strategy]) {
                        strategies[strategy] = [];
                    }
                    strategies[strategy].push(test.parallelMetrics as { throughput?: { qps: number } });
                }
            });

            // Recommend best strategy
            let bestStrategy: string | null = null;
            let bestQPS = 0;

            Object.entries(strategies).forEach(([strategy, metrics]) => {
                const avgQPS = metrics.reduce((sum, m) => sum + (m.throughput?.qps || 0), 0) / metrics.length;
                if (avgQPS > bestQPS) {
                    bestQPS = avgQPS;
                    bestStrategy = strategy;
                }
            });

            if (bestStrategy) {
                recommendations.push({
                    priority: 'medium',
                    category: 'optimization',
                    title: '並列実行戦略の最適化',
                    description: `"${bestStrategy}"戦略が最も高いスループット（平均${bestQPS.toFixed(2)} QPS）を示しました`,
                    actions: [
                        `本番環境では"${bestStrategy}"戦略の使用を推奨`,
                        '負荷パターンに応じて戦略を調整',
                        '並列度の最適値を探索'
                    ]
                });
            }
        }

        return recommendations;
    }

    /**
     * Sort recommendations by priority
     */
    sortRecommendationsByPriority(recommendations: RecommendationItem[]): RecommendationItem[] {
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return recommendations.sort((a, b) => {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }
}
