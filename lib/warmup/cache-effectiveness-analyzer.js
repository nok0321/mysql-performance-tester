/**
 * キャッシュ効果分析クラス
 * ウォームアップ実行結果からキャッシュの効果を分析
 */

export class CacheEffectivenessAnalyzer {
    /**
     * キャッシュ効果の分析
     * @param {Array} results - ウォームアップ実行結果
     * @returns {Object|null} キャッシュ効果分析結果
     */
    static analyze(results) {
        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length < 2) {
            return null;
        }

        const durations = successfulResults.map(r => r.duration);

        // 前半と後半で比較
        const halfPoint = Math.ceil(durations.length / 2);
        const firstHalf = durations.slice(0, halfPoint);
        const secondHalf = durations.slice(halfPoint);

        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        // 改善率の計算
        const improvement = ((avgFirst - avgSecond) / avgFirst) * 100;

        // 傾向分析（線形回帰の簡易版）
        const trend = this.analyzeTrend(durations);

        return {
            firstHalfAvg: this.round(avgFirst, 2),
            secondHalfAvg: this.round(avgSecond, 2),
            improvementPercentage: this.round(improvement, 2),
            effectivenessRating: this.rateEffectiveness(improvement),
            trend: trend,
            recommendation: this.generateRecommendation(improvement, trend)
        };
    }

    /**
     * トレンド分析（簡易版）
     * @param {Array} durations - 実行時間の配列
     * @returns {Object} トレンド分析結果
     */
    static analyzeTrend(durations) {
        // 3つのグループに分割して平均を計算
        const n = durations.length;
        const groupSize = Math.floor(n / 3);

        const group1 = durations.slice(0, groupSize);
        const group2 = durations.slice(groupSize, groupSize * 2);
        const group3 = durations.slice(groupSize * 2);

        const avg1 = group1.reduce((a, b) => a + b, 0) / group1.length;
        const avg2 = group2.reduce((a, b) => a + b, 0) / group2.length;
        const avg3 = group3.reduce((a, b) => a + b, 0) / group3.length;

        // トレンドの判定
        let trendType;
        if (avg1 > avg2 && avg2 > avg3) {
            trendType = 'decreasing'; // 改善傾向
        } else if (avg1 < avg2 && avg2 < avg3) {
            trendType = 'increasing'; // 悪化傾向
        } else if (Math.abs(avg1 - avg3) < avg1 * 0.1) {
            trendType = 'stable'; // 安定
        } else {
            trendType = 'fluctuating'; // 変動
        }

        return {
            type: trendType,
            group1Avg: this.round(avg1, 2),
            group2Avg: this.round(avg2, 2),
            group3Avg: this.round(avg3, 2)
        };
    }

    /**
     * キャッシュ効果の評価
     * @param {number} improvementPercentage - 改善率（%）
     * @returns {string} 評価
     */
    static rateEffectiveness(improvementPercentage) {
        if (improvementPercentage > 50) {
            return 'Excellent (キャッシュ効果が非常に高い)';
        } else if (improvementPercentage > 30) {
            return 'Good (キャッシュ効果が高い)';
        } else if (improvementPercentage > 10) {
            return 'Fair (キャッシュ効果あり)';
        } else if (improvementPercentage > 0) {
            return 'Low (キャッシュ効果が低い)';
        } else {
            return 'None (キャッシュ効果なし)';
        }
    }

    /**
     * 推奨事項の生成
     * @param {number} improvement - 改善率
     * @param {Object} trend - トレンド情報
     * @returns {string} 推奨事項
     */
    static generateRecommendation(improvement, trend) {
        if (improvement > 30 && trend.type === 'decreasing') {
            return 'ウォームアップが効果的です。現在の設定を維持してください。';
        } else if (improvement > 10 && trend.type === 'decreasing') {
            return 'ある程度の効果があります。ウォームアップ回数を増やすことを検討してください。';
        } else if (improvement < 10) {
            return 'ウォームアップの効果が限定的です。データベースのキャッシュ設定を確認してください。';
        } else if (trend.type === 'fluctuating') {
            return '実行時間が不安定です。システムの負荷や他のプロセスの影響を確認してください。';
        } else {
            return 'ウォームアップを継続することを推奨します。';
        }
    }

    /**
     * 数値の丸め
     * @param {number} value - 丸める値
     * @param {number} decimals - 小数点以下の桁数
     * @returns {number} 丸められた値
     */
    static round(value, decimals) {
        if (value === null || value === undefined || isNaN(value)) {
            return null;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
}
