/**
 * Logger Utility - ログユーティリティ
 *
 * ログ出力機能を一元管理
 *
 * 機能:
 * - ログレベル（DEBUG, INFO, WARN, ERROR）
 * - カラー出力
 * - タイムスタンプ表示
 * - プログレスバー
 *
 * @module utils/logger
 */

/**
 * ログレベル定義
 */
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * ANSIカラーコード
 */
const Colors = {
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',

    // 文字色
    FgBlack: '\x1b[30m',
    FgRed: '\x1b[31m',
    FgGreen: '\x1b[32m',
    FgYellow: '\x1b[33m',
    FgBlue: '\x1b[34m',
    FgMagenta: '\x1b[35m',
    FgCyan: '\x1b[36m',
    FgWhite: '\x1b[37m',

    // 背景色
    BgBlack: '\x1b[40m',
    BgRed: '\x1b[41m',
    BgGreen: '\x1b[42m',
    BgYellow: '\x1b[43m',
    BgBlue: '\x1b[44m',
    BgMagenta: '\x1b[45m',
    BgCyan: '\x1b[46m',
    BgWhite: '\x1b[47m'
} as const;

/**
 * Logger設定オプション
 */
interface LoggerOptions {
    level?: number;
    enableColors?: boolean;
    enableTimestamp?: boolean;
    prefix?: string;
}

/**
 * Loggerクラス
 */
export class Logger {
    level: number;
    enableColors: boolean;
    enableTimestamp: boolean;
    prefix: string;

    /**
     * Loggerを初期化
     * @param options - 設定オプション
     */
    constructor(options: LoggerOptions = {}) {
        this.level = options.level !== undefined ? options.level : LogLevel.INFO;
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp !== false;
        this.prefix = options.prefix || '';
    }

    /**
     * ログレベルを設定
     * @param level - ログレベル
     */
    setLevel(level: number): void {
        this.level = level;
    }

    /**
     * DEBUGログを出力
     * @param args - 出力する内容
     */
    debug(...args: unknown[]): void {
        if (this.level <= LogLevel.DEBUG) {
            this.log('DEBUG', Colors.FgCyan, ...args);
        }
    }

    /**
     * INFOログを出力
     * @param args - 出力する内容
     */
    info(...args: unknown[]): void {
        if (this.level <= LogLevel.INFO) {
            this.log('INFO', Colors.FgGreen, ...args);
        }
    }

    /**
     * WARNログを出力
     * @param args - 出力する内容
     */
    warn(...args: unknown[]): void {
        if (this.level <= LogLevel.WARN) {
            this.log('WARN', Colors.FgYellow, ...args);
        }
    }

    /**
     * ERRORログを出力
     * @param args - 出力する内容
     */
    error(...args: unknown[]): void {
        if (this.level <= LogLevel.ERROR) {
            this.log('ERROR', Colors.FgRed, ...args);
        }
    }

    /**
     * ログ出力の共通処理
     * @param level - ログレベル名
     * @param color - カラーコード
     * @param args - 出力する内容
     */
    log(level: string, color: string, ...args: unknown[]): void {
        const timestamp = this.enableTimestamp ? this.getTimestamp() : '';
        const levelStr = this.formatLevel(level, color);
        const prefix = this.prefix ? `[${this.prefix}] ` : '';

        const message = args.map(arg => {
            if (typeof arg === 'object') {
                return JSON.stringify(arg, null, 2);
            }
            return String(arg);
        }).join(' ');

        const output = `${timestamp}${levelStr}${prefix}${message}`;

        // ERRORの場合はstderrに出力
        if (level === 'ERROR') {
            console.error(output);
        } else {
            console.log(output);
        }
    }

    /**
     * ログレベルをフォーマット
     * @param level - ログレベル
     * @param color - カラーコード
     * @returns フォーマットされたレベル名
     */
    formatLevel(level: string, color: string): string {
        const levelStr = level.padEnd(5);

        if (this.enableColors) {
            return `${color}[${levelStr}]${Colors.Reset} `;
        }

        return `[${levelStr}] `;
    }

    /**
     * タイムスタンプを取得
     * @returns フォーマットされたタイムスタンプ
     */
    getTimestamp(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');

        const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;

        if (this.enableColors) {
            return `${Colors.Dim}${timestamp}${Colors.Reset} `;
        }

        return `${timestamp} `;
    }

    /**
     * プログレスバーを表示
     * @param current - 現在値
     * @param total - 最大値
     * @param barLength - バーの長さ
     */
    progressBar(current: number, total: number, barLength: number = 40): void {
        const percentage = (current / total) * 100;
        const filled = Math.floor((current / total) * barLength);
        const empty = barLength - filled;

        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
        const percentStr = percentage.toFixed(1).padStart(5);

        const output = this.enableColors
            ? `${Colors.FgCyan}Progress: [${bar}] ${percentStr}%${Colors.Reset}`
            : `Progress: [${bar}] ${percentStr}%`;

        // 同じ行を上書きして表示（カーソル移動）
        process.stdout.write(`\r${output}`);

        // 完了時は改行
        if (current >= total) {
            process.stdout.write('\n');
        }
    }

    /**
     * 区切り線を表示
     * @param char - 区切り文字
     * @param length - 長さ
     */
    separator(char: string = '=', length: number = 60): void {
        const line = char.repeat(length);
        console.log(this.enableColors ? `${Colors.Dim}${line}${Colors.Reset}` : line);
    }

    /**
     * タイトルを表示
     * @param title - タイトル文字列
     * @param length - 幅
     */
    title(title: string, length: number = 60): void {
        this.separator('=', length);
        const padding = Math.max(0, (length - title.length) / 2);
        const paddedTitle = ' '.repeat(Math.floor(padding)) + title;

        if (this.enableColors) {
            console.log(`${Colors.Bright}${paddedTitle}${Colors.Reset}`);
        } else {
            console.log(paddedTitle);
        }

        this.separator('=', length);
    }

    /**
     * テーブル形式で表示
     * @param data - データ配列
     * @param columns - カラム配列
     */
    table(data: Array<Record<string, unknown>>, columns: string[]): void {
        if (!data || data.length === 0) {
            this.warn('No data to display');
            return;
        }

        // カラム幅を計算
        const columnWidths: Record<string, number> = {};
        columns.forEach(col => {
            columnWidths[col] = col.length;
        });

        data.forEach(row => {
            columns.forEach(col => {
                const value = String(row[col] || '');
                columnWidths[col] = Math.max(columnWidths[col], value.length);
            });
        });

        // ヘッダーを表示
        const header = columns.map(col => col.padEnd(columnWidths[col])).join(' | ');
        console.log(header);
        console.log(columns.map(col => '-'.repeat(columnWidths[col])).join('-+-'));

        // データを表示
        data.forEach(row => {
            const line = columns.map(col => {
                const value = String(row[col] || '');
                return value.padEnd(columnWidths[col]);
            }).join(' | ');
            console.log(line);
        });
    }

    /**
     * 成功メッセージを表示
     * @param message - メッセージ
     */
    success(message: string): void {
        if (this.enableColors) {
            console.log(`${Colors.FgGreen}\u2713 ${message}${Colors.Reset}`);
        } else {
            console.log(`\u2713 ${message}`);
        }
    }

    /**
     * 失敗メッセージを表示
     * @param message - メッセージ
     */
    failure(message: string): void {
        if (this.enableColors) {
            console.log(`${Colors.FgRed}\u2717 ${message}${Colors.Reset}`);
        } else {
            console.log(`\u2717 ${message}`);
        }
    }
}

/**
 * デフォルトLoggerインスタンス
 */
export const defaultLogger = new Logger();

/**
 * 便利な関数エクスポート
 */
export const debug = (...args: unknown[]): void => defaultLogger.debug(...args);
export const info = (...args: unknown[]): void => defaultLogger.info(...args);
export const warn = (...args: unknown[]): void => defaultLogger.warn(...args);
export const error = (...args: unknown[]): void => defaultLogger.error(...args);
export const success = (message: string): void => defaultLogger.success(message);
export const failure = (message: string): void => defaultLogger.failure(message);

export default Logger;
