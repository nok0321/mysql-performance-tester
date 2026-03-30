import { describe, it, expect } from 'vitest';
import {
    ValidationError,
    validateQuery,
    validateConfig,
    validatePercentile,
    validatePositiveInteger,
    validateString,
    validateDatabaseConfig,
    validateArray,
} from '../../lib/utils/validator.js';

describe('ValidationError', () => {
    it('has correct name and field', () => {
        const err = new ValidationError('test message', 'testField');
        expect(err.name).toBe('ValidationError');
        expect(err.field).toBe('testField');
        expect(err.message).toBe('test message');
    });

    it('is instanceof Error', () => {
        expect(new ValidationError('msg')).toBeInstanceOf(Error);
    });
});

describe('validateQuery', () => {
    it('passes valid SELECT query', () => {
        expect(validateQuery('SELECT * FROM users')).toBe(true);
    });

    it('throws for null', () => {
        expect(() => validateQuery(null as unknown as string)).toThrow(ValidationError);
    });

    it('throws for non-string', () => {
        expect(() => validateQuery(123 as unknown as string)).toThrow(ValidationError);
    });

    it('throws for empty string', () => {
        expect(() => validateQuery('')).toThrow(ValidationError);
        expect(() => validateQuery('   ')).toThrow(ValidationError);
    });

    it('allows empty when option set', () => {
        expect(validateQuery('', { allowEmpty: true })).toBe(true);
    });

    it('enforces allowedStatements', () => {
        expect(() => validateQuery('DROP TABLE users', { allowedStatements: ['SELECT'] }))
            .toThrow(ValidationError);
    });

    it('passes allowed statement', () => {
        expect(validateQuery('SELECT 1', { allowedStatements: ['SELECT'] })).toBe(true);
    });

    it('detects dangerous multi-statement patterns', () => {
        expect(() => validateQuery('SELECT 1; DROP TABLE users')).toThrow(ValidationError);
        expect(() => validateQuery('SELECT 1; DELETE FROM users')).toThrow(ValidationError);
        expect(() => validateQuery('SELECT 1; TRUNCATE users')).toThrow(ValidationError);
    });

    it('detects standalone dangerous statements', () => {
        expect(() => validateQuery('DROP TABLE users')).toThrow(ValidationError);
        expect(() => validateQuery('TRUNCATE TABLE users')).toThrow(ValidationError);
        expect(() => validateQuery('DELETE FROM users')).toThrow(ValidationError);
    });
});

describe('validateConfig', () => {
    it('passes valid config', () => {
        expect(validateConfig({ test: { testIterations: 10, parallelThreads: 5 } })).toBe(true);
    });

    it('throws for non-object', () => {
        expect(() => validateConfig(null as unknown as { test: Record<string, unknown> })).toThrow(ValidationError);
        expect(() => validateConfig('string' as unknown as { test: Record<string, unknown> })).toThrow(ValidationError);
    });

    it('throws for missing test property', () => {
        expect(() => validateConfig({} as unknown as { test: Record<string, unknown> })).toThrow(ValidationError);
    });

    it('validates testIterations range', () => {
        expect(() => validateConfig({ test: { testIterations: -1 } })).toThrow(ValidationError);
        expect(() => validateConfig({ test: { testIterations: 20000 } })).toThrow(ValidationError);
    });

    it('validates outlierMethod', () => {
        expect(validateConfig({ test: { outlierMethod: 'iqr' } })).toBe(true);
        expect(() => validateConfig({ test: { outlierMethod: 'invalid' } })).toThrow(ValidationError);
    });
});

describe('validatePercentile', () => {
    it('passes valid percentile', () => {
        expect(validatePercentile(50)).toBe(true);
        expect(validatePercentile(0)).toBe(true);
        expect(validatePercentile(100)).toBe(true);
    });

    it('throws for out of range', () => {
        expect(() => validatePercentile(-1)).toThrow(ValidationError);
        expect(() => validatePercentile(101)).toThrow(ValidationError);
    });

    it('throws for non-number', () => {
        expect(() => validatePercentile('50' as unknown as number)).toThrow(ValidationError);
        expect(() => validatePercentile(null as unknown as number)).toThrow(ValidationError);
    });
});

describe('validatePositiveInteger', () => {
    it('passes valid integer', () => {
        expect(validatePositiveInteger(5, 'count')).toBe(true);
    });

    it('throws for non-integer', () => {
        expect(() => validatePositiveInteger(3.5, 'count')).toThrow(ValidationError);
    });

    it('throws for negative', () => {
        expect(() => validatePositiveInteger(-1, 'count', { min: 0 })).toThrow(ValidationError);
    });

    it('enforces min/max range', () => {
        expect(() => validatePositiveInteger(5, 'count', { min: 10 })).toThrow(ValidationError);
        expect(() => validatePositiveInteger(100, 'count', { max: 50 })).toThrow(ValidationError);
    });

    it('throws for null/NaN', () => {
        expect(() => validatePositiveInteger(null as unknown as number, 'count')).toThrow(ValidationError);
        expect(() => validatePositiveInteger(NaN, 'count')).toThrow(ValidationError);
    });
});

describe('validateString', () => {
    it('passes valid string', () => {
        expect(validateString('hello', 'name')).toBe(true);
    });

    it('throws for empty string by default', () => {
        expect(() => validateString('', 'name')).toThrow(ValidationError);
    });

    it('allows empty when option set', () => {
        expect(validateString('', 'name', { allowEmpty: true })).toBe(true);
    });

    it('enforces minLength', () => {
        expect(() => validateString('ab', 'name', { minLength: 5 })).toThrow(ValidationError);
    });

    it('enforces maxLength', () => {
        expect(() => validateString('toolong', 'name', { maxLength: 3 })).toThrow(ValidationError);
    });

    it('enforces pattern', () => {
        expect(validateString('abc123', 'name', { pattern: /^[a-z0-9]+$/ })).toBe(true);
        expect(() => validateString('ABC!', 'name', { pattern: /^[a-z]+$/ })).toThrow(ValidationError);
    });

    it('throws for non-string', () => {
        expect(() => validateString(123 as unknown as string, 'name')).toThrow(ValidationError);
        expect(() => validateString(null as unknown as string, 'name')).toThrow(ValidationError);
    });
});

describe('validateDatabaseConfig', () => {
    it('passes valid config', () => {
        expect(validateDatabaseConfig({ host: 'localhost', port: 3306 })).toBe(true);
    });

    it('throws for non-object', () => {
        expect(() => validateDatabaseConfig(null as unknown as Record<string, unknown>)).toThrow(ValidationError);
    });

    it('validates port range', () => {
        expect(() => validateDatabaseConfig({ port: 0 })).toThrow(ValidationError);
        expect(() => validateDatabaseConfig({ port: 70000 })).toThrow(ValidationError);
    });

    it('validates timeout values', () => {
        expect(validateDatabaseConfig({ connectTimeout: 5000 })).toBe(true);
        expect(() => validateDatabaseConfig({ connectTimeout: -1 })).toThrow(ValidationError);
    });
});

describe('validateArray', () => {
    it('passes valid array', () => {
        expect(validateArray([1, 2, 3], 'items')).toBe(true);
    });

    it('throws for empty array by default', () => {
        expect(() => validateArray([], 'items')).toThrow(ValidationError);
    });

    it('allows empty when option set', () => {
        expect(validateArray([], 'items', { allowEmpty: true })).toBe(true);
    });

    it('enforces min/max length', () => {
        expect(() => validateArray([1], 'items', { minLength: 3 })).toThrow(ValidationError);
        expect(() => validateArray([1, 2, 3, 4], 'items', { maxLength: 2 })).toThrow(ValidationError);
    });

    it('throws for non-array', () => {
        expect(() => validateArray('not-array' as unknown as unknown[], 'items')).toThrow(ValidationError);
        expect(() => validateArray(null as unknown as unknown[], 'items')).toThrow(ValidationError);
    });

    it('runs item validator', () => {
        const validator = (item: unknown): void => {
            if (typeof item !== 'number') throw new Error('must be number');
        };
        expect(validateArray([1, 2, 3], 'items', { itemValidator: validator })).toBe(true);
        expect(() => validateArray([1, 'two', 3], 'items', { itemValidator: validator }))
            .toThrow(ValidationError);
    });
});
