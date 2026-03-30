/**
 * Formatter Utility - フォーマットユーティリティ
 *
 * 数値や文字列を読みやすい形式に変換
 *
 * 機能:
 * - 数値の丸め処理
 * - 時間をフォーマット（秒、分、時）
 * - パーセンテージフォーマット
 * - 数値のカンマ区切り
 *
 * @module utils/formatter
 */

/**
 * 期間フォーマットオプション
 */
interface DurationOptions {
    verbose?: boolean;
    decimals?: number;
}

/**
 * パーセンテージフォーマットオプション
 */
interface PercentageOptions {
    decimals?: number;
    includeSymbol?: boolean;
}

/**
 * 数値フォーマットオプション
 */
interface NumberFormatOptions {
    decimals?: number;
    separator?: string;
}

/**
 * バイトフォーマットオプション
 */
interface BytesOptions {
    decimals?: number;
    binary?: boolean;
}

/**
 * QPSフォーマットオプション
 */
interface QPSOptions {
    decimals?: number;
}

/**
 * レイテンシフォーマットオプション
 */
interface LatencyOptions {
    decimals?: number;
}

/**
 * タイムスタンプフォーマットオプション
 */
interface TimestampOptions {
    format?: 'iso' | 'date' | 'time' | 'datetime';
}

/**
 * テーブルフォーマットオプション
 */
interface TableOptions {
    formatters?: Record<string, (value: unknown) => string>;
}

/**
 * 数値を小数点以下で丸める
 * @param value - 値
 * @param decimals - 小数点以下の桁数
 * @returns 丸められた値
 *
 * @example
 * round(3.14159, 2); // 3.14
 * round(10.12345, 3); // 10.123
 */
export function round(value: number, decimals: number): number {
    if (value === null || value === undefined || isNaN(value)) {
        return 0;
    }

    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * 実行時間をフォーマット
 * @param milliseconds - ミリ秒
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatDuration(1500); // "1.50s"
 * formatDuration(1500, { verbose: true }); // "1 second 500 milliseconds"
 * formatDuration(65000); // "1.08m"
 */
export function formatDuration(milliseconds: number, options: DurationOptions = {}): string {
    const { verbose = false, decimals = 2 } = options;

    if (milliseconds === null || milliseconds === undefined || isNaN(milliseconds)) {
        return verbose ? '0 milliseconds' : '0ms';
    }

    if (verbose) {
        // 詳細表示
        const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
        const ms = Math.floor(milliseconds % 1000);

        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        if (ms > 0 || parts.length === 0) parts.push(`${ms} millisecond${ms !== 1 ? 's' : ''}`);

        return parts.join(' ');
    }

    // 簡潔な表示
    if (milliseconds < 1000) {
        return `${round(milliseconds, decimals)}ms`;
    } else if (milliseconds < 60000) {
        return `${round(milliseconds / 1000, decimals)}s`;
    } else if (milliseconds < 3600000) {
        return `${round(milliseconds / 60000, decimals)}m`;
    } else {
        return `${round(milliseconds / 3600000, decimals)}h`;
    }
}

/**
 * パーセンテージをフォーマット
 * @param value - 値（0-100）
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatPercentage(95.12345); // "95.12%"
 * formatPercentage(95.12345, { decimals: 1 }); // "95.1%"
 * formatPercentage(95.12345, { includeSymbol: false }); // "95.12"
 */
export function formatPercentage(value: number, options: PercentageOptions = {}): string {
    const { decimals = 2, includeSymbol = true } = options;

    if (value === null || value === undefined || isNaN(value)) {
        return includeSymbol ? '0.00%' : '0.00';
    }

    const formatted = round(value, decimals).toFixed(decimals);
    return includeSymbol ? `${formatted}%` : formatted;
}

/**
 * 数値にカンマ区切りをフォーマット
 * @param value - 値
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatNumber(1234567); // "1,234,567"
 * formatNumber(1234567.89, { decimals: 2 }); // "1,234,567.89"
 * formatNumber(1234567, { separator: '_' }); // "1_234_567"
 */
export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
    const { decimals = 0, separator = ',' } = options;

    if (value === null || value === undefined || isNaN(value)) {
        return '0';
    }

    const roundedValue = round(value, decimals);
    const [integerPart, decimalPart] = roundedValue.toFixed(decimals).split('.');

    // 整数部にカンマ区切りを追加
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);

    if (decimals > 0 && decimalPart) {
        return `${formattedInteger}.${decimalPart}`;
    }

    return formattedInteger;
}

/**
 * バイト数をフォーマット
 * @param bytes - バイト数
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatBytes(1024); // "1.02KB"
 * formatBytes(1024, { binary: true }); // "1.00KiB"
 * formatBytes(1048576); // "1.05MB"
 */
export function formatBytes(bytes: number, options: BytesOptions = {}): string {
    const { decimals = 2, binary = false } = options;

    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) {
        return '0B';
    }

    const base = binary ? 1024 : 1000;
    const units = binary
        ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
        : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const exponent = Math.floor(Math.log(Math.abs(bytes)) / Math.log(base));
    const unitIndex = Math.min(exponent, units.length - 1);
    const value = bytes / Math.pow(base, unitIndex);

    return `${round(value, decimals)}${units[unitIndex]}`;
}

/**
 * QPSをフォーマット
 * @param qps - QPS値
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatQPS(1234.56); // "1,234.56 qps"
 */
export function formatQPS(qps: number, options: QPSOptions = {}): string {
    const { decimals = 2 } = options;

    if (qps === null || qps === undefined || isNaN(qps)) {
        return '0.00 qps';
    }

    return `${formatNumber(qps, { decimals })} qps`;
}

/**
 * レイテンシをフォーマット
 * @param milliseconds - ミリ秒
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatLatency(12.345); // "12.35ms"
 * formatLatency(1234.5); // "1.23s"
 */
export function formatLatency(milliseconds: number, options: LatencyOptions = {}): string {
    const { decimals = 2 } = options;

    if (milliseconds === null || milliseconds === undefined || isNaN(milliseconds)) {
        return '0.00ms';
    }

    if (milliseconds < 1000) {
        return `${round(milliseconds, decimals)}ms`;
    } else {
        return `${round(milliseconds / 1000, decimals)}s`;
    }
}

/**
 * タイムスタンプをフォーマット
 * @param timestamp - タイムスタンプ
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 *
 * @example
 * formatTimestamp(new Date()); // "2025-01-15T12:34:56.789Z"
 * formatTimestamp(new Date(), { format: 'datetime' }); // "2025-01-15 12:34:56"
 */
export function formatTimestamp(timestamp: Date | string | number, options: TimestampOptions = {}): string {
    const { format = 'iso' } = options;

    let date: Date;
    if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else {
        return 'Invalid Date';
    }

    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    switch (format) {
        case 'iso':
            return date.toISOString();

        case 'date':
            return date.toISOString().split('T')[0];

        case 'time':
            return date.toISOString().split('T')[1].split('.')[0];

        case 'datetime': {
            const datePart = date.toISOString().split('T')[0];
            const timePart = date.toISOString().split('T')[1].split('.')[0];
            return `${datePart} ${timePart}`;
        }

        default:
            return date.toISOString();
    }
}

/**
 * テーブル形式にフォーマット
 * @param data - データ配列
 * @param columns - カラム配列
 * @param options - 設定オプション
 * @returns フォーマットされた文字列
 */
export function formatTable(data: Array<Record<string, unknown>>, columns: string[], options: TableOptions = {}): string {
    const { formatters = {} } = options;

    if (!data || data.length === 0) {
        return 'No data';
    }

    // カラム幅を計算
    const columnWidths: Record<string, number> = {};
    columns.forEach(col => {
        columnWidths[col] = col.length;
    });

    data.forEach(row => {
        columns.forEach(col => {
            const formatter = formatters[col];
            const value = formatter ? formatter(row[col]) : String(row[col] || '');
            columnWidths[col] = Math.max(columnWidths[col], value.length);
        });
    });

    const lines: string[] = [];

    // ヘッダー
    const header = columns.map(col => col.padEnd(columnWidths[col])).join(' | ');
    lines.push(header);
    lines.push(columns.map(col => '-'.repeat(columnWidths[col])).join('-+-'));

    // データ行
    data.forEach(row => {
        const line = columns.map(col => {
            const formatter = formatters[col];
            const value = formatter ? formatter(row[col]) : String(row[col] || '');
            return value.padEnd(columnWidths[col]);
        }).join(' | ');
        lines.push(line);
    });

    return lines.join('\n');
}

/**
 * SQLファイル名からテスト名を生成
 * @param filename - ファイル名（例: "01_complex_join.sql"）
 * @returns テスト名（例: "01 Complex Join"）
 *
 * @example
 * generateTestName('01_user_search.sql'); // "01 User Search"
 * generateTestName('検索クエリ.sql');      // "検索クエリ"
 */
export function generateTestName(filename: string): string {
    const nameWithoutExt = filename.endsWith('.sql')
        ? filename.slice(0, -4)
        : filename;

    // 日本語（ひらがな・カタカナ・漢字）を含む場合はそのまま使用
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(nameWithoutExt)) {
        return nameWithoutExt;
    }

    // 英語ファイル名: アンダースコア・ハイフンをスペースに変換して各単語を大文字化
    return nameWithoutExt
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * デフォルトエクスポート
 */
export default {
    round,
    formatDuration,
    formatPercentage,
    formatNumber,
    formatBytes,
    formatQPS,
    formatLatency,
    formatTimestamp,
    formatTable,
    generateTestName
};
