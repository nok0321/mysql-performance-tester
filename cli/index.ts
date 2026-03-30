#!/usr/bin/env tsx

/**
 * MySQL Performance Tester - CLI Entry Point
 */

import { parseArguments, generateHelpMessage, getVersion } from './options.js';
import type { ParsedOptions } from './options.js';
import { runCommand } from './commands/run.js';
import { parallelCommand } from './commands/parallel.js';
import { analyzeCommand } from './commands/analyze.js';
import { createDbConfig } from '../lib/config/database-configuration.js';
import { createTestConfig } from '../lib/config/test-configuration.js';
import { MySQLPerformanceTester } from '../lib/testers/single-tester.js';

/**
 * Main CLI function
 */
async function main(): Promise<void> {
    const parsed = parseArguments(process.argv);

    // Display help
    if (parsed.options.help || parsed.command === 'help') {
        console.log(generateHelpMessage());
        process.exit(0);
    }

    // Display version
    if (parsed.options.version) {
        console.log(`MySQL Performance Tester v${getVersion()}`);
        process.exit(0);
    }

    // Execute command
    const command = parsed.command || 'run';

    try {
        switch (command) {
            case 'run':
                // Sequential test execution
                await runCommand(parsed.options);
                break;

            case 'parallel':
                // Parallel load test execution
                await parallelCommand(parsed.options);
                break;

            case 'analyze': {
                // Analyze existing results
                const resultPath = parsed.positional[0];
                await analyzeCommand(parsed.options, resultPath);
                break;
            }

            case 'demo':
                // Demo mode (for verification)
                await demoCommand(parsed.options);
                break;

            default:
                console.error(`\n❌ 不明なコマンド: ${command}`);
                console.log('\nヘルプを表示するには: mysql-perf-test help');
                process.exit(1);
        }
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('\n❌ 致命的なエラー:', err.message);
        if (parsed.options.verbose) {
            console.error(err.stack);
        }
        process.exit(1);
    }
}

/**
 * Demo command
 */
async function demoCommand(options: ParsedOptions): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester - デモモード'.padStart(40));
    console.log('='.repeat(60));

    console.log('\n🎯 デモモードで実行中...\n');

    // Build configuration
    const dbConfig = createDbConfig({
        host:     options.host,
        port:     options.port,
        user:     options.user,
        password: options.password,
        database: options.database,
    });

    const testConfig = createTestConfig({
        testIterations: 5,    // Fewer iterations for demo
        enableWarmup:   false, // No warmup for demo
        generateReport: false,
    });

    let tester: MySQLPerformanceTester | null = null;

    try {
        tester = new MySQLPerformanceTester(dbConfig, testConfig);
        await tester.initialize();

        console.log('✓ データベース接続成功\n');

        // Execute simple tests
        const testQueries: Array<{ name: string; query: string }> = [
            { name: 'デモ: 基本SELECT', query: 'SELECT 1 as test' },
            { name: 'デモ: 現在時刻', query: 'SELECT NOW() as current_time' },
            { name: 'デモ: データベース情報', query: 'SELECT DATABASE() as db_name, VERSION() as version' }
        ];

        for (const { name, query } of testQueries) {
            console.log(`\n実行中: ${name}`);
            console.log(`SQL: ${query}`);

            const result = await tester.executeTest(name, query);

            if (result?.statistics?.basic?.mean != null) {
                console.log(`✓ 完了: 平均実行時間 ${result.statistics.basic.mean.toFixed(2)}ms`);
            } else {
                console.log(`✓ 完了`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ デモが完了しました！'.padStart(40));
        console.log('='.repeat(60));

        console.log('\n次のステップ:');
        console.log('  1. ./sql ディレクトリにSQLファイルを配置');
        console.log('  2. mysql-perf-test run を実行');
        console.log('  3. 詳細なヘルプ: mysql-perf-test help');

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('\n❌ エラーが発生しました:', err.message);
        if (options.verbose) {
            console.error(err.stack);
        }
        process.exit(1);
    } finally {
        if (tester) {
            await tester.cleanup();
        }
    }
}

// Error handling
process.on('unhandledRejection', (error: unknown) => {
    console.error('\n❌ 未処理のエラー:', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n⚠️ 中断されました');
    process.exit(130);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️ 終了シグナルを受信');
    process.exit(143);
});

// CLI execution
main().catch((error: unknown) => {
    console.error('\n❌ CLI実行エラー:', error);
    process.exit(1);
});
