/**
 * 分布分析クラス
 * ヒストグラムとデータ分布の分析
 */

export class DistributionAnalyzer {
    /**
     * 分布の計算（ヒストグラム）
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} binCount - ビン数（nullの場合はSturges' ruleを使用）
     * @returns {Object} { bins, binCount, binWidth }
     */
    static calculateDistribution(sortedArray, binCount = null) {
        if (!binCount) {
            // Sturges' ruleを使用
            binCount = Math.ceil(Math.log2(sortedArray.length) + 1);
        }

        const min = sortedArray[0];
        const max = sortedArray[sortedArray.length - 1];
        const binWidth = (max - min) / binCount;

        const bins = Array(binCount).fill(0).map((_, i) => ({
            start: min + i * binWidth,
            end: min + (i + 1) * binWidth,
            count: 0,
            percentage: 0
        }));

        sortedArray.forEach(val => {
            const binIndex = Math.min(
                Math.floor((val - min) / binWidth),
                binCount - 1
            );
            bins[binIndex].count++;
        });

        bins.forEach(bin => {
            bin.percentage = this.round((bin.count / sortedArray.length) * 100, 2);
            bin.start = this.round(bin.start, 3);
            bin.end = this.round(bin.end, 3);
        });

        return {
            bins,
            binCount,
            binWidth: this.round(binWidth, 3)
        };
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
