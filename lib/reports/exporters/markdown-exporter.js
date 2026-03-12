/**
 * Markdownエクスポーター
 * レポートデータをMarkdown形式でエクスポート
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseExporter } from './base-exporter.js';

/**
 * Markdownエクスポータークラス
 */
export class MarkdownExporter extends BaseExporter {
    /**
     * レポートをMarkdownファイルとしてエクスポート
     */
    async export(reportData, outputDir) {
        await fs.mkdir(outputDir, { recursive: true });

        const md = this.generateMarkdown(reportData);
        const mdPath = path.join(outputDir, 'analysis-report.md');
        await fs.writeFile(mdPath, md, 'utf8');

        return mdPath;
    }

    /**
     * Markdownレポートの生成
     */
    generateMarkdown(reportData) {
        let md = `# MySQL Performance Test Report\n\n`;
        md += `**生成日時:** ${reportData.metadata.generatedAt}\n`;
        md += `**総テスト数:** ${reportData.metadata.totalTests}\n\n`;

        md += `## 📊 サマリー\n\n`;
        md += `- **総合評価:** ${reportData.summary.performanceGrade}\n`;
        md += `- **平均P95:** ${reportData.summary.overallMetrics.averageP95 || 'N/A'}ms\n`;
        md += `- **最大QPS:** ${reportData.summary.overallMetrics.maxQPS || 'N/A'}\n`;
        md += `- **平均QPS:** ${reportData.summary.overallMetrics.avgQPS || 'N/A'}\n\n`;

        if (reportData.recommendations.length > 0) {
            md += `## 💡 推奨事項\n\n`;
            reportData.recommendations.forEach(rec => {
                md += `### ${rec.title} [${rec.priority.toUpperCase()}]\n\n`;
                md += `${rec.description}\n\n`;
                md += `**対応策:**\n`;
                rec.actions.forEach(action => {
                    md += `- ${action}\n`;
                });
                md += `\n`;
            });
        }

        md += `## 📝 テスト詳細\n\n`;
        reportData.details.forEach((detail, index) => {
            md += `### ${index + 1}. ${detail.testName}\n\n`;

            // クエリが存在する場合のみ表示
            if (detail.query) {
                md += `**クエリ:** \`${detail.query}\`\n\n`;
            }

            // 並列テストの場合
            if (detail.isParallelTest && detail.parallelMetrics) {
                const metrics = detail.parallelMetrics;

                md += `**📊 並列実行メトリクス**\n`;
                md += `- 配布戦略: ${metrics.strategy}\n`;
                md += `- 総実行時間: ${metrics.duration.total.toFixed(2)}ms (${metrics.duration.seconds.toFixed(3)}秒)\n\n`;

                md += `**🔢 クエリ実行数**\n`;
                md += `- 総クエリ数: ${metrics.queries.total}\n`;
                md += `- 成功: ${metrics.queries.completed}\n`;
                md += `- 失敗: ${metrics.queries.failed}\n`;
                md += `- 成功率: ${metrics.queries.successRate}\n\n`;

                md += `**⚡ スループット [${metrics.throughput.grade}]**\n`;
                md += `- QPS: ${metrics.throughput.qps.toFixed(2)}\n`;
                md += `- 実効QPS: ${metrics.throughput.effectiveQps.toFixed(2)}\n\n`;

                md += `**⏱️ レイテンシ統計 [${metrics.latency.grade}]**\n`;
                md += `- P50 (中央値): ${metrics.latency.percentiles.p50}ms\n`;
                md += `- P95: ${metrics.latency.percentiles.p95}ms\n`;
                md += `- P99: ${metrics.latency.percentiles.p99}ms\n`;
                md += `- 平均: ${metrics.latency.basic.mean}ms\n`;
                md += `- 最小: ${metrics.latency.basic.min}ms\n`;
                md += `- 最大: ${metrics.latency.basic.max}ms\n`;
                md += `- 標準偏差: ${metrics.latency.spread.stdDev}ms\n`;
                md += `- 変動係数: ${metrics.latency.spread.cv}%\n\n`;

                if (metrics.latency.interpretation && metrics.latency.interpretation.length > 0) {
                    md += `**解釈:**\n`;
                    metrics.latency.interpretation.forEach(interp => {
                        md += `- ${interp}\n`;
                    });
                    md += `\n`;
                }

                // SQLファイル別内訳
                const perFile = metrics.perFile || {};
                const fileEntries = Object.entries(perFile);
                if (fileEntries.length > 0) {
                    md += `**📄 SQLファイル別内訳**\n\n`;
                    md += `| ファイル名 | 成功 | 失敗 | 成功率 | 平均(ms) | P50(ms) | P95(ms) | P99(ms) | 最小(ms) | 最大(ms) |\n`;
                    md += `|---|---|---|---|---|---|---|---|---|---|\n`;
                    fileEntries.forEach(([fileName, fs]) => {
                        md += `| \`${fileName}\` | ${fs.completed} | ${fs.failed} | ${fs.successRate} | ${fs.latency?.mean ?? '-'} | ${fs.latency?.p50 ?? '-'} | ${fs.latency?.p95 ?? '-'} | ${fs.latency?.p99 ?? '-'} | ${fs.latency?.min ?? '-'} | ${fs.latency?.max ?? '-'} |\n`;
                    });
                    md += `\n`;
                }
            } else if (detail.statistics) {
                // 通常のテスト
                md += `**統計:** [${detail.statistics.grade}]\n`;
                md += `- P50: ${detail.statistics.percentiles.p50}ms\n`;
                md += `- P95: ${detail.statistics.percentiles.p95}ms\n`;
                md += `- P99: ${detail.statistics.percentiles.p99}ms\n`;
                md += `- 平均: ${detail.statistics.basic.mean}ms\n\n`;

                if (detail.statistics.interpretation && detail.statistics.interpretation.length > 0) {
                    md += `**解釈:**\n`;
                    detail.statistics.interpretation.forEach(interp => {
                        md += `- ${interp}\n`;
                    });
                    md += `\n`;
                }
            }

            // Buffer Pool情報
            if (detail.bufferPool) {
                md += `**Buffer Pool [${detail.bufferPool.grade}]**\n`;
                md += `- ヒット率: ${detail.bufferPool.hitRatio}%\n\n`;
            }
        });

        return md;
    }
}
