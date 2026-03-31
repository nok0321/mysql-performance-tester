import { describe, it, expect } from 'vitest';
import { fingerprintQuery } from '../../lib/utils/query-fingerprint.js';

describe('fingerprintQuery', () => {
    it('returns a 16-char hex hash', () => {
        const fp = fingerprintQuery('SELECT * FROM users');
        expect(fp.hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns normalized SQL', () => {
        const fp = fingerprintQuery('  SELECT  *  FROM  users  ;  ');
        expect(fp.normalized).toBe('select * from users');
    });

    // ── Identity: same logical query → same hash ────────────────────────

    it('produces same hash regardless of whitespace', () => {
        const a = fingerprintQuery('SELECT * FROM users WHERE id = 1');
        const b = fingerprintQuery('SELECT  *  FROM  users  WHERE  id  =  1');
        const c = fingerprintQuery('SELECT\n*\nFROM\nusers\nWHERE\nid\n=\n1');
        expect(a.hash).toBe(b.hash);
        expect(a.hash).toBe(c.hash);
    });

    it('produces same hash regardless of casing', () => {
        const a = fingerprintQuery('SELECT * FROM users');
        const b = fingerprintQuery('select * from users');
        const c = fingerprintQuery('Select * From Users');
        expect(a.hash).toBe(b.hash);
        expect(a.hash).toBe(c.hash);
    });

    it('produces same hash regardless of numeric literal values', () => {
        const a = fingerprintQuery('SELECT * FROM users WHERE id = 1');
        const b = fingerprintQuery('SELECT * FROM users WHERE id = 42');
        const c = fingerprintQuery('SELECT * FROM users WHERE id = 9999');
        expect(a.hash).toBe(b.hash);
        expect(a.hash).toBe(c.hash);
    });

    it('produces same hash regardless of string literal values', () => {
        const a = fingerprintQuery("SELECT * FROM users WHERE name = 'Alice'");
        const b = fingerprintQuery("SELECT * FROM users WHERE name = 'Bob'");
        expect(a.hash).toBe(b.hash);
    });

    it('produces same hash with or without trailing semicolons', () => {
        const a = fingerprintQuery('SELECT 1');
        const b = fingerprintQuery('SELECT 1;');
        const c = fingerprintQuery('SELECT 1 ; ');
        expect(a.hash).toBe(b.hash);
        expect(a.hash).toBe(c.hash);
    });

    it('produces same hash ignoring comments', () => {
        const a = fingerprintQuery('SELECT * FROM users');
        const b = fingerprintQuery('/* test query */ SELECT * FROM users');
        const c = fingerprintQuery('SELECT * FROM users -- fetch all');
        expect(a.hash).toBe(b.hash);
        expect(a.hash).toBe(c.hash);
    });

    // ── Differentiation: structurally different queries → different hash ─

    it('produces different hash for structurally different queries', () => {
        const a = fingerprintQuery('SELECT * FROM users');
        const b = fingerprintQuery('SELECT * FROM orders');
        expect(a.hash).not.toBe(b.hash);
    });

    it('produces different hash when WHERE clause differs structurally', () => {
        const a = fingerprintQuery('SELECT * FROM users WHERE id = 1');
        const b = fingerprintQuery('SELECT * FROM users WHERE name = 1');
        expect(a.hash).not.toBe(b.hash);
    });

    it('produces different hash for SELECT vs INSERT', () => {
        const a = fingerprintQuery('SELECT * FROM users');
        const b = fingerprintQuery("INSERT INTO users VALUES (1, 'test')");
        expect(a.hash).not.toBe(b.hash);
    });

    // ── Edge cases ──────────────────────────────────────────────────────

    it('handles decimal literals', () => {
        const a = fingerprintQuery('SELECT * FROM t WHERE price > 10.5');
        const b = fingerprintQuery('SELECT * FROM t WHERE price > 99.99');
        expect(a.hash).toBe(b.hash);
    });

    it('handles escaped quotes in strings', () => {
        const fp = fingerprintQuery("SELECT * FROM t WHERE name = 'O\\'Brien'");
        expect(fp.normalized).toContain('?');
        expect(fp.normalized).not.toContain("o'brien");
    });

    it('handles double-quoted strings', () => {
        const a = fingerprintQuery('SELECT * FROM t WHERE name = "Alice"');
        const b = fingerprintQuery('SELECT * FROM t WHERE name = "Bob"');
        expect(a.hash).toBe(b.hash);
    });

    it('handles empty-ish input gracefully', () => {
        const fp = fingerprintQuery('   ');
        expect(fp.hash).toMatch(/^[0-9a-f]{16}$/);
        expect(fp.normalized).toBe('');
    });
});
