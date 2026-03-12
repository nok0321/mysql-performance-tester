/**
 * CLI Options - コマンドラインオプション定義
 */

export const CLI_OPTIONS = {
    // データベース接続オプション
    host: {
        alias: 'H',
        type: 'string',
        description: 'Database host',
        default: process.env.DB_HOST || 'localhost'
    },
    port: {
        alias: 'P',
        type: 'number',
        description: 'Database port',
        default: parseInt(process.env.DB_PORT) || 3306
    },
    user: {
        alias: 'u',
        type: 'string',
        description: 'Database user',
        default: process.env.DB_USER || 'root'
    },
    password: {
        alias: 'p',
        type: 'string',
        description: 'Database password',
        default: process.env.DB_PASSWORD || ''
    },
    database: {
        alias: 'd',
        type: 'string',
        description: 'Database name',
        default: process.env.DB_NAME || 'sample_app'
    },

    // テスト設定オプション
    iterations: {
        alias: 'i',
        type: 'number',
        description: 'Number of test iterations',
        default: 20
    },
    threads: {
        alias: 't',
        type: 'number',
        description: 'Number of parallel threads',
        default: 10
    },
    sqlDir: {
        alias: 's',
        type: 'string',
        description: 'SQL files directory for sequential tests',
        default: './sql'
    },
    parallelDir: {
        type: 'string',
        description: 'SQL files directory for parallel tests',
        default: './parallel'
    },

    // ウォームアップオプション
    warmup: {
        type: 'boolean',
        description: 'Enable warmup phase',
        default: true
    },
    warmupPercentage: {
        type: 'number',
        description: 'Warmup percentage (0-100)',
        default: 20
    },

    // 統計オプション
    removeOutliers: {
        type: 'boolean',
        description: 'Remove outliers from statistics',
        default: true
    },
    outlierMethod: {
        type: 'string',
        description: 'Outlier detection method (iqr, zscore, mad)',
        default: 'iqr',
        choices: ['iqr', 'zscore', 'mad']
    },

    // 分析オプション
    explainAnalyze: {
        type: 'boolean',
        description: 'Enable EXPLAIN ANALYZE',
        default: true
    },
    performanceSchema: {
        type: 'boolean',
        description: 'Enable Performance Schema analysis',
        default: true
    },
    optimizerTrace: {
        type: 'boolean',
        description: 'Enable Optimizer Trace',
        default: true
    },
    bufferPoolMonitoring: {
        type: 'boolean',
        description: 'Enable Buffer Pool monitoring',
        default: false
    },

    // レポートオプション
    generateReport: {
        type: 'boolean',
        description: 'Generate analysis report',
        default: true
    },
    outputDir: {
        alias: 'o',
        type: 'string',
        description: 'Output directory for results',
        default: null // デフォルトはタイムスタンプベース
    },

    // その他のオプション
    skipParallel: {
        type: 'boolean',
        description: 'Skip parallel tests in default mode',
        default: false
    },
    verbose: {
        alias: 'v',
        type: 'boolean',
        description: 'Verbose output',
        default: false
    },
    help: {
        alias: 'h',
        type: 'boolean',
        description: 'Show help'
    },
    version: {
        alias: 'V',
        type: 'boolean',
        description: 'Show version'
    }
};

/**
 * コマンドライン引数をパース
 */
export function parseArguments(args) {
    const result = {
        command: null,
        options: {},
        positional: []
    };

    // デフォルト値を設定
    for (const [key, option] of Object.entries(CLI_OPTIONS)) {
        if (option.default !== undefined) {
            result.options[key] = option.default;
        }
    }

    let i = 2; // process.argv[0] = node, process.argv[1] = script
    while (i < args.length) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            result.options.help = true;
            i++;
        } else if (arg === '--version' || arg === '-V') {
            result.options.version = true;
            i++;
        } else if (arg.startsWith('--')) {
            // ロングオプション
            const key = arg.slice(2);
            const option = CLI_OPTIONS[key];

            if (option) {
                if (option.type === 'boolean') {
                    result.options[key] = true;
                } else if (i + 1 < args.length) {
                    i++;
                    const value = args[i];
                    result.options[key] = option.type === 'number' ? parseFloat(value) : value;
                }
            }
            i++;
        } else if (arg.startsWith('-')) {
            // ショートオプション
            const shortKey = arg.slice(1);
            const longKey = Object.keys(CLI_OPTIONS).find(
                k => CLI_OPTIONS[k].alias === shortKey
            );

            if (longKey) {
                const option = CLI_OPTIONS[longKey];
                if (option.type === 'boolean') {
                    result.options[longKey] = true;
                } else if (i + 1 < args.length) {
                    i++;
                    const value = args[i];
                    result.options[longKey] = option.type === 'number' ? parseFloat(value) : value;
                }
            }
            i++;
        } else {
            // 位置引数またはコマンド
            if (!result.command) {
                result.command = arg;
            } else {
                result.positional.push(arg);
            }
            i++;
        }
    }

    return result;
}

/**
 * ヘルプメッセージを生成
 */
export function generateHelpMessage() {
    return `
MySQL Performance Tester - Command Line Interface

使用方法:
  mysql-perf-test <command> [options]

コマンド:
  run               順次テスト実行（デフォルト）
  parallel          並列負荷テスト実行
  analyze           既存の結果を分析
  demo              デモモード（動作確認用）
  help              ヘルプを表示

データベース接続オプション:
  -H, --host <host>           Database host (default: localhost)
  -P, --port <port>           Database port (default: 3306)
  -u, --user <user>           Database user (default: root)
  -p, --password <password>   Database password
  -d, --database <database>   Database name (default: sample_app)

テスト設定オプション:
  -i, --iterations <n>        Test iterations (default: 20)
  -t, --threads <n>           Parallel threads (default: 10)
  -s, --sqlDir <dir>          SQL directory for sequential tests (default: ./sql)
  --parallelDir <dir>         SQL directory for parallel tests (default: ./parallel)

ウォームアップオプション:
  --warmup                    Enable warmup phase (default: true)
  --warmupPercentage <n>      Warmup percentage (default: 20)

統計オプション:
  --removeOutliers            Remove outliers (default: true)
  --outlierMethod <method>    Outlier method: iqr, zscore, mad (default: iqr)

分析オプション:
  --explainAnalyze            Enable EXPLAIN ANALYZE (default: true)
  --performanceSchema         Enable Performance Schema (default: true)
  --optimizerTrace            Enable Optimizer Trace (default: true)
  --bufferPoolMonitoring      Enable Buffer Pool monitoring (default: false)

レポートオプション:
  --generateReport            Generate report (default: true)
  -o, --outputDir <dir>       Output directory

その他:
  --skipParallel              Skip parallel tests in default mode
  -v, --verbose               Verbose output
  -h, --help                  Show help
  -V, --version               Show version

例:
  mysql-perf-test run -i 50 -t 20
  mysql-perf-test parallel --sqlDir ./queries
  mysql-perf-test analyze -o ./performance_results/2025-01-15T10-30-00
  mysql-perf-test demo

環境変数:
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
`;
}

/**
 * バージョン情報を取得
 */
export function getVersion() {
    return '1.0.0';
}
