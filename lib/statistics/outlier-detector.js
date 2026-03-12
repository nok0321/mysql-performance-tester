/**
 * 外れ値検出クラス
 * 複数の統計的手法を用いた外れ値の検出と除外
 */

export class OutlierDetector {
    /**
     * 外れ値の検出と除外
     * @param {number[]} sortedArray - ソート済み配列
     * @param {string} method - 検出方法 ('iqr', 'zscore', 'mad')
     * @returns {Object} { filtered, outliers, bounds }
     */
    static detectAndRemoveOutliers(sortedArray, method = 'iqr') {
        if (method === 'iqr') {
            return this.removeOutliersIQR(sortedArray);
        } else if (method === 'zscore') {
            return this.removeOutliersZScore(sortedArray);
        } else if (method === 'mad') {
            return this.removeOutliersMAD(sortedArray);
        }

        throw new Error(`Unknown outlier detection method: ${method}`);
    }

    /**
     * IQR法による外れ値除外
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} multiplier - IQR乗数（デフォルト1.5）
     * @returns {Object} { filtered, outliers, bounds }
     */
    static removeOutliersIQR(sortedArray, multiplier = 1.5) {
        const q1 = this.calculatePercentile(sortedArray, 25);
        const q3 = this.calculatePercentile(sortedArray, 75);
        const iqr = q3 - q1;

        const lowerBound = q1 - multiplier * iqr;
        const upperBound = q3 + multiplier * iqr;

        const filtered = [];
        const outliers = [];

        sortedArray.forEach(val => {
            if (val >= lowerBound && val <= upperBound) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return {
            filtered,
            outliers,
            bounds: {
                lower: this.round(lowerBound, 3),
                upper: this.round(upperBound, 3)
            }
        };
    }

    /**
     * Z-score法による外れ値除外
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} threshold - Z-scoreしきい値（デフォルト3）
     * @returns {Object} { filtered, outliers }
     */
    static removeOutliersZScore(sortedArray, threshold = 3) {
        const mean = sortedArray.reduce((a, b) => a + b, 0) / sortedArray.length;
        const stdDev = Math.sqrt(
            sortedArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            sortedArray.length
        );

        const filtered = [];
        const outliers = [];

        sortedArray.forEach(val => {
            const zScore = Math.abs((val - mean) / stdDev);
            if (zScore <= threshold) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return { filtered, outliers };
    }

    /**
     * MAD法による外れ値除外（ロバストな手法）
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} threshold - Modified Z-scoreしきい値（デフォルト3.5）
     * @returns {Object} { filtered, outliers }
     */
    static removeOutliersMAD(sortedArray, threshold = 3.5) {
        const median = this.calculatePercentile(sortedArray, 50);
        const deviations = sortedArray.map(val => Math.abs(val - median));
        const madValue = this.calculatePercentile(deviations.sort((a, b) => a - b), 50);

        // Modified Z-score = 0.6745 * (x - median) / MAD
        const filtered = [];
        const outliers = [];

        sortedArray.forEach(val => {
            const modifiedZScore = 0.6745 * Math.abs(val - median) / madValue;
            if (modifiedZScore <= threshold) {
                filtered.push(val);
            } else {
                outliers.push(val);
            }
        });

        return { filtered, outliers };
    }

    /**
     * パーセンタイル計算（線形補間法）
     * @param {number[]} sortedArray - ソート済み配列
     * @param {number} percentile - パーセンタイル (0-100)
     * @returns {number} パーセンタイル値
     */
    static calculatePercentile(sortedArray, percentile) {
        if (percentile < 0 || percentile > 100) {
            throw new Error('Percentile must be between 0 and 100');
        }

        if (sortedArray.length === 0) {
            return null;
        }

        if (sortedArray.length === 1) {
            return sortedArray[0];
        }

        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
            return sortedArray[lower];
        }

        // 線形補間
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
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
