/**
 * Base exporter class
 * Defines the contract that all report exporters in lib/reports/exporters/ must implement
 */

export class BaseExporter {
    constructor() {
        if (new.target === BaseExporter) {
            throw new Error('BaseExporter は抽象クラスです。直接インスタンス化できません');
        }
    }

    /**
     * Export report data to a file
     * @param _reportData - Report data
     * @param _outputDir - Output directory
     * @returns Absolute path of the exported file
     */
    async export(_reportData: Record<string, unknown>, _outputDir: string): Promise<string> {
        throw new Error(`${this.constructor.name} は export() を実装する必要があります`);
    }
}
