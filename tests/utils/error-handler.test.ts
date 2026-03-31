import { describe, it, expect } from 'vitest';
import {
  PerformanceTestError,
  DatabaseConnectionError,
  QueryExecutionError,
  ConfigurationError,
  TimeoutError,
  FileSystemError,
  ErrorHandler,
} from '../../lib/utils/error-handler.js';

// ─── PerformanceTestError ───────────────────────────────────────────────

describe('PerformanceTestError', () => {
  it('should construct with message only', () => {
    const err = new PerformanceTestError('something failed');
    expect(err.message).toBe('something failed');
    expect(err.name).toBe('PerformanceTestError');
    expect(err.context).toEqual({});
    expect(err.cause).toBeNull();
    expect(err.recoverable).toBe(true);
    expect(err.timestamp).toBeDefined();
    expect(err).toBeInstanceOf(Error);
  });

  it('should construct with all options', () => {
    const cause = new Error('root cause');
    const err = new PerformanceTestError('with opts', {
      context: { query: 'SELECT 1' },
      cause,
      recoverable: false,
    });
    expect(err.context).toEqual({ query: 'SELECT 1' });
    expect(err.cause).toBe(cause);
    expect(err.recoverable).toBe(false);
  });

  it('should default recoverable to true (not false)', () => {
    const err = new PerformanceTestError('test');
    expect(err.recoverable).toBe(true);
  });

  it('should produce valid JSON via toJSON()', () => {
    const cause = new Error('inner');
    const err = new PerformanceTestError('outer', {
      context: { step: 1 },
      cause,
      recoverable: false,
    });
    const json = err.toJSON();

    expect(json.name).toBe('PerformanceTestError');
    expect(json.message).toBe('outer');
    expect(json.timestamp).toBeDefined();
    expect(json.context).toEqual({ step: 1 });
    expect(json.cause).toBe('inner');
    expect(json.recoverable).toBe(false);
    expect(json.stack).toBeDefined();
  });

  it('should set cause to null in JSON when no cause provided', () => {
    const err = new PerformanceTestError('no cause');
    expect(err.toJSON().cause).toBeNull();
  });

  it('should have a valid ISO timestamp', () => {
    const err = new PerformanceTestError('ts');
    expect(new Date(err.timestamp).toISOString()).toBe(err.timestamp);
  });
});

// ─── DatabaseConnectionError ────────────────────────────────────────────

describe('DatabaseConnectionError', () => {
  it('should set name to DatabaseConnectionError', () => {
    const err = new DatabaseConnectionError('conn failed');
    expect(err.name).toBe('DatabaseConnectionError');
    expect(err).toBeInstanceOf(PerformanceTestError);
    expect(err).toBeInstanceOf(Error);
  });

  it('should default recoverable to true', () => {
    const err = new DatabaseConnectionError('conn failed');
    expect(err.recoverable).toBe(true);
  });

  it('should allow setting recoverable to false', () => {
    const err = new DatabaseConnectionError('fatal conn', { recoverable: false });
    expect(err.recoverable).toBe(false);
  });

  it('should propagate context and cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new DatabaseConnectionError('cannot connect', {
      context: { host: 'localhost', port: 3306 },
      cause,
    });
    expect(err.context).toEqual({ host: 'localhost', port: 3306 });
    expect(err.cause).toBe(cause);
  });
});

// ─── QueryExecutionError ────────────────────────────────────────────────

describe('QueryExecutionError', () => {
  it('should set name and SQL-specific fields', () => {
    const err = new QueryExecutionError('syntax error', {
      query: 'SELECT * FORM users',
      sqlState: '42000',
      errno: 1064,
    });
    expect(err.name).toBe('QueryExecutionError');
    expect(err.query).toBe('SELECT * FORM users');
    expect(err.sqlState).toBe('42000');
    expect(err.errno).toBe(1064);
    expect(err).toBeInstanceOf(PerformanceTestError);
  });

  it('should default SQL fields to null', () => {
    const err = new QueryExecutionError('generic error');
    expect(err.query).toBeNull();
    expect(err.sqlState).toBeNull();
    expect(err.errno).toBeNull();
  });

  it('should include SQL fields in toJSON()', () => {
    const err = new QueryExecutionError('bad query', {
      query: 'DROP TABLE foo',
      sqlState: 'HY000',
      errno: 1051,
    });
    const json = err.toJSON();
    expect(json.query).toBe('DROP TABLE foo');
    expect(json.sqlState).toBe('HY000');
    expect(json.errno).toBe(1051);
    // Also inherits base fields
    expect(json.name).toBe('QueryExecutionError');
    expect(json.message).toBe('bad query');
  });

  it('should propagate message from parent', () => {
    const err = new QueryExecutionError('test message');
    expect(err.message).toBe('test message');
  });
});

// ─── ConfigurationError ─────────────────────────────────────────────────

describe('ConfigurationError', () => {
  it('should set name and field', () => {
    const err = new ConfigurationError('invalid value', { field: 'port' });
    expect(err.name).toBe('ConfigurationError');
    expect(err.field).toBe('port');
  });

  it('should always be non-recoverable', () => {
    const err = new ConfigurationError('bad config');
    expect(err.recoverable).toBe(false);
  });

  it('should include field in toJSON()', () => {
    const err = new ConfigurationError('missing', { field: 'host' });
    const json = err.toJSON();
    expect(json.field).toBe('host');
    expect(json.recoverable).toBe(false);
  });
});

// ─── TimeoutError ───────────────────────────────────────────────────────

describe('TimeoutError', () => {
  it('should set timeout and operation fields', () => {
    const err = new TimeoutError('query timed out', {
      timeout: 30000,
      operation: 'SELECT',
    });
    expect(err.name).toBe('TimeoutError');
    expect(err.timeout).toBe(30000);
    expect(err.operation).toBe('SELECT');
  });

  it('should include timeout fields in toJSON()', () => {
    const err = new TimeoutError('slow', { timeout: 5000, operation: 'connect' });
    const json = err.toJSON();
    expect(json.timeout).toBe(5000);
    expect(json.operation).toBe('connect');
  });
});

// ─── FileSystemError ────────────────────────────────────────────────────

describe('FileSystemError', () => {
  it('should set filePath and operation fields', () => {
    const err = new FileSystemError('file not found', {
      filePath: '/tmp/result.json',
      operation: 'read',
    });
    expect(err.name).toBe('FileSystemError');
    expect(err.filePath).toBe('/tmp/result.json');
    expect(err.operation).toBe('read');
  });

  it('should include filesystem fields in toJSON()', () => {
    const err = new FileSystemError('write failed', {
      filePath: '/out/data.csv',
      operation: 'write',
    });
    const json = err.toJSON();
    expect(json.filePath).toBe('/out/data.csv');
    expect(json.operation).toBe('write');
  });
});

// ─── ErrorHandler ───────────────────────────────────────────────────────

describe('ErrorHandler', () => {
  it('should categorize DatabaseConnectionError', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new DatabaseConnectionError('conn err');
    const info = handler.handle(err);
    expect(info.type).toBe('DATABASE_CONNECTION');
    expect(info.severity).toBe('HIGH');
  });

  it('should categorize QueryExecutionError', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new QueryExecutionError('bad sql');
    const info = handler.handle(err);
    expect(info.type).toBe('QUERY_EXECUTION');
    expect(info.severity).toBe('MEDIUM');
  });

  it('should categorize ConfigurationError as CRITICAL', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new ConfigurationError('invalid');
    const info = handler.handle(err);
    expect(info.type).toBe('CONFIGURATION');
    expect(info.severity).toBe('CRITICAL');
  });

  it('should categorize TimeoutError', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new TimeoutError('timed out');
    const info = handler.handle(err);
    expect(info.type).toBe('TIMEOUT');
    expect(info.severity).toBe('MEDIUM');
  });

  it('should categorize FileSystemError', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new FileSystemError('no file');
    const info = handler.handle(err);
    expect(info.type).toBe('FILESYSTEM');
  });

  it('should categorize ECONNREFUSED errors', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = Object.assign(new Error('conn refused'), { code: 'ECONNREFUSED' });
    const info = handler.handle(err);
    expect(info.type).toBe('CONNECTION_REFUSED');
  });

  it('should categorize ENOENT errors', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const info = handler.handle(err);
    expect(info.type).toBe('FILE_NOT_FOUND');
  });

  it('should categorize unknown errors', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new Error('something unknown');
    const info = handler.handle(err);
    expect(info.type).toBe('UNKNOWN');
    expect(info.severity).toBe('LOW');
  });

  it('should record errors and respect maxLogSize', () => {
    const handler = new ErrorHandler({ logger: silentLogger(), maxLogSize: 3 });
    handler.handle(new Error('err1'));
    handler.handle(new Error('err2'));
    handler.handle(new Error('err3'));
    handler.handle(new Error('err4'));

    const errors = handler.getErrors();
    expect(errors).toHaveLength(3);
    // Oldest should have been removed
    expect(errors[0].message).toBe('err2');
  });

  it('should filter errors by type', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    handler.handle(new DatabaseConnectionError('conn1'));
    handler.handle(new QueryExecutionError('query1'));
    handler.handle(new DatabaseConnectionError('conn2'));

    const connErrors = handler.getErrors({ type: 'DATABASE_CONNECTION' });
    expect(connErrors).toHaveLength(2);
  });

  it('should filter errors by severity', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    handler.handle(new ConfigurationError('cfg'));
    handler.handle(new QueryExecutionError('q'));
    handler.handle(new Error('generic'));

    const critical = handler.getErrors({ severity: 'CRITICAL' });
    expect(critical).toHaveLength(1);
  });

  it('should limit results with limit option', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    handler.handle(new Error('a'));
    handler.handle(new Error('b'));
    handler.handle(new Error('c'));

    const limited = handler.getErrors({ limit: 2 });
    expect(limited).toHaveLength(2);
    // limit uses slice(-limit) so returns the most recent
    expect(limited[0].message).toBe('b');
    expect(limited[1].message).toBe('c');
  });

  it('should clearLog', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    handler.handle(new Error('a'));
    handler.handle(new Error('b'));
    expect(handler.getErrors()).toHaveLength(2);

    handler.clearLog();
    expect(handler.getErrors()).toHaveLength(0);
  });

  it('should generate a report', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    handler.handle(new ConfigurationError('cfg'));
    handler.handle(new DatabaseConnectionError('conn'));
    handler.handle(new QueryExecutionError('q'));

    const report = handler.generateReport();
    expect(report.totalErrors).toBe(3);
    expect(report.summary.totalErrors).toBe(3);
    expect(report.summary.criticalCount).toBe(1);
    expect(report.summary.highCount).toBe(1);
    expect(report.summary.mediumCount).toBe(1);
    expect(report.errorsByType).toBeDefined();
    expect(report.errorsBySeverity).toBeDefined();
    expect(report.timeline).toHaveLength(3);
    expect(report.generatedAt).toBeDefined();
  });

  it('should assign HIGH severity to QueryExecutionError with syntax errno', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new QueryExecutionError('syntax', { errno: 1064 });
    const info = handler.handle(err);
    expect(info.severity).toBe('HIGH');
  });

  it('should assign MEDIUM severity to QueryExecutionError with deadlock errno', () => {
    const handler = new ErrorHandler({ logger: silentLogger() });
    const err = new QueryExecutionError('deadlock', { errno: 1213 });
    const info = handler.handle(err);
    expect(info.severity).toBe('MEDIUM');
  });
});

/**
 * Create a silent logger to suppress output during tests
 */
function silentLogger() {
  const noop = () => {};
  return { error: noop, warn: noop, info: noop, log: noop } as unknown as Console;
}
