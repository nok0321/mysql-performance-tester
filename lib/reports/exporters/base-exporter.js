/**
 * エクスポーター基底クラス
 * lib/reports/exporters/ 配下のすべてのレポートエクスポーターが実装すべきコントラクトを定義する
 */

export class BaseExporter {
    constructor() {
        if (new.target === BaseExporter) {
            throw new Error('BaseExporter は抽象クラスです。直接インスタンス化できません');
        }
    }

    /**
     * レポートデータをファイルにエクスポートする
     * @param {Object} reportData - レポートデータ
     * @param {string} outputDir  - 出力ディレクトリ
     * @returns {Promise<string>} エクスポートされたファイルの絶対パス
     */
    async export(reportData, outputDir) {
        throw new Error(`${this.constructor.name} は export() を実装する必要があります`);
    }
}
