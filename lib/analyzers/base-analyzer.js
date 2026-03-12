/**
 * アナライザー基底クラス
 * lib/analyzers/ 配下のすべての DB クエリアナライザーが実装すべきコントラクトを定義する
 */

export class BaseAnalyzer {
    /**
     * @param {Object} connection - DatabaseConnection インスタンス
     * @param {Object} config     - createTestConfig() が返すプレーンオブジェクト
     */
    constructor(connection, config) {
        if (new.target === BaseAnalyzer) {
            throw new Error('BaseAnalyzer は抽象クラスです。直接インスタンス化できません');
        }
        this.connection = connection;
        this.config = config;
    }
}
