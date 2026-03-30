import { describe, it, expect } from 'vitest';
import {
    round,
    formatDuration,
    formatPercentage,
    formatNumber,
    formatBytes,
    formatQPS,
    formatLatency,
    formatTimestamp,
    formatTable,
    generateTestName,
} from '../../lib/utils/formatter.js';

describe('round', () => {
    it('rounds to specified decimals', () => {
        expect(round(3.14159, 2)).toBe(3.14);
        expect(round(10.12345, 3)).toBe(10.123);
    });

    it('returns 0 for null/undefined/NaN', () => {
        expect(round(null as unknown as number, 2)).toBe(0);
        expect(round(undefined as unknown as number, 2)).toBe(0);
        expect(round(NaN, 2)).toBe(0);
    });
});

describe('formatDuration', () => {
    it('formats milliseconds', () => {
        expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
        expect(formatDuration(1500)).toBe('1.5s');
    });

    it('formats minutes', () => {
        expect(formatDuration(90000)).toBe('1.5m');
    });

    it('formats hours', () => {
        expect(formatDuration(7200000)).toBe('2h');
    });

    it('verbose mode', () => {
        expect(formatDuration(1500, { verbose: true })).toBe('1 second 500 milliseconds');
    });

    it('handles null/NaN', () => {
        expect(formatDuration(null as unknown as number)).toBe('0ms');
        expect(formatDuration(NaN)).toBe('0ms');
    });

    it('verbose handles zero', () => {
        expect(formatDuration(0, { verbose: true })).toBe('0 milliseconds');
    });
});

describe('formatPercentage', () => {
    it('formats with default options', () => {
        expect(formatPercentage(95.12345)).toBe('95.12%');
    });

    it('custom decimals', () => {
        expect(formatPercentage(95.12345, { decimals: 1 })).toBe('95.1%');
    });

    it('without symbol', () => {
        expect(formatPercentage(95.12345, { includeSymbol: false })).toBe('95.12');
    });

    it('handles null/NaN', () => {
        expect(formatPercentage(null as unknown as number)).toBe('0.00%');
    });
});

describe('formatNumber', () => {
    it('adds comma separators', () => {
        expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('with decimals', () => {
        expect(formatNumber(1234567.89, { decimals: 2 })).toBe('1,234,567.89');
    });

    it('custom separator', () => {
        expect(formatNumber(1234567, { separator: '_' })).toBe('1_234_567');
    });

    it('handles null/NaN', () => {
        expect(formatNumber(null as unknown as number)).toBe('0');
    });
});

describe('formatBytes', () => {
    it('formats zero', () => {
        expect(formatBytes(0)).toBe('0B');
    });

    it('formats kilobytes (decimal)', () => {
        expect(formatBytes(1500)).toBe('1.5KB');
    });

    it('formats binary units', () => {
        expect(formatBytes(1024, { binary: true })).toBe('1KiB');
    });

    it('handles null', () => {
        expect(formatBytes(null as unknown as number)).toBe('0B');
    });
});

describe('formatQPS', () => {
    it('formats QPS', () => {
        expect(formatQPS(1234.56)).toBe('1,234.56 qps');
    });

    it('handles null', () => {
        expect(formatQPS(null as unknown as number)).toBe('0.00 qps');
    });
});

describe('formatLatency', () => {
    it('formats ms', () => {
        expect(formatLatency(12.345)).toBe('12.35ms');
    });

    it('formats seconds for >= 1000ms', () => {
        expect(formatLatency(1234.5)).toBe('1.23s');
    });

    it('handles null', () => {
        expect(formatLatency(null as unknown as number)).toBe('0.00ms');
    });
});

describe('formatTimestamp', () => {
    it('formats ISO by default', () => {
        const date = new Date('2025-01-15T12:00:00Z');
        expect(formatTimestamp(date)).toBe('2025-01-15T12:00:00.000Z');
    });

    it('formats date only', () => {
        const date = new Date('2025-01-15T12:00:00Z');
        expect(formatTimestamp(date, { format: 'date' })).toBe('2025-01-15');
    });

    it('formats time only', () => {
        const date = new Date('2025-01-15T12:34:56Z');
        expect(formatTimestamp(date, { format: 'time' })).toBe('12:34:56');
    });

    it('formats datetime', () => {
        const date = new Date('2025-01-15T12:34:56Z');
        expect(formatTimestamp(date, { format: 'datetime' })).toBe('2025-01-15 12:34:56');
    });

    it('handles invalid input', () => {
        expect(formatTimestamp({} as unknown as Date)).toBe('Invalid Date');
        expect(formatTimestamp('not-a-date')).toBe('Invalid Date');
    });

    it('accepts string and number timestamps', () => {
        expect(formatTimestamp('2025-01-15T12:00:00Z')).toBe('2025-01-15T12:00:00.000Z');
        expect(formatTimestamp(0, { format: 'date' })).toBe('1970-01-01');
    });
});

describe('formatTable', () => {
    it('formats table with headers and rows', () => {
        const data: Array<Record<string, unknown>> = [{ name: 'test', value: 42 }];
        const result = formatTable(data, ['name', 'value']);
        expect(result).toContain('name');
        expect(result).toContain('test');
        expect(result).toContain('42');
    });

    it('returns "No data" for empty array', () => {
        expect(formatTable([], ['a'])).toBe('No data');
    });

    it('returns "No data" for null', () => {
        expect(formatTable(null as unknown as Array<Record<string, unknown>>, ['a'])).toBe('No data');
    });
});

describe('generateTestName', () => {
    it('converts underscore filenames', () => {
        expect(generateTestName('01_user_search.sql')).toBe('01 User Search');
    });

    it('preserves Japanese filenames', () => {
        expect(generateTestName('検索クエリ.sql')).toBe('検索クエリ');
    });

    it('handles filenames without .sql extension', () => {
        expect(generateTestName('simple_test')).toBe('Simple Test');
    });

    it('converts hyphens', () => {
        expect(generateTestName('complex-join.sql')).toBe('Complex Join');
    });
});
