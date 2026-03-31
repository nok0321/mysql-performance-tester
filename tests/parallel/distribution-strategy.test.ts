import { describe, it, expect, vi } from 'vitest';
import {
    DistributionStrategy,
    RandomDistributionStrategy,
    RoundRobinDistributionStrategy,
    SequentialDistributionStrategy,
    CategoryBasedDistributionStrategy,
    StrategyFactory,
} from '../../lib/parallel/distribution-strategy.js';
import type { SQLFileCategory } from '../../lib/parallel/sql-file-manager.js';
import { SQLFile } from '../../lib/parallel/sql-file-manager.js';

// --- Helpers ---

interface MockFile {
    fileName: string;
    category: SQLFileCategory;
}

function createMockSQLFile(fileName: string): SQLFile {
    return new SQLFile(fileName, `/mock/${fileName}`, 'SELECT 1');
}

function createMockSQLFileManager(fileNames: string[]) {
    const files = fileNames.map(f => createMockSQLFile(f));
    return {
        getSQLFiles: () => files,
        getFileCount: () => files.length,
        getSQLFile: (index: number) => files[index],
        getRandomSQLFile: () => {
            if (files.length === 0) return null;
            const idx = Math.floor(Math.random() * files.length);
            return files[idx];
        },
        loadSQLFiles: vi.fn(),
    };
}

function createEmptyMockSQLFileManager() {
    return createMockSQLFileManager([]);
}

// --- Tests ---

describe('DistributionStrategy (base class)', () => {
    it('throws when selectSQLFile is called directly', () => {
        const manager = createMockSQLFileManager(['01_test.sql']);
        const base = new DistributionStrategy(manager as any);
        expect(() => base.selectSQLFile(1, 1, 10)).toThrow('selectSQLFile method must be implemented');
    });

    it('returns class name from getStrategyName()', () => {
        const manager = createMockSQLFileManager(['01_test.sql']);
        const base = new DistributionStrategy(manager as any);
        expect(base.getStrategyName()).toBe('DistributionStrategy');
    });
});

describe('RandomDistributionStrategy', () => {
    it('returns a valid SQLFile object', () => {
        const manager = createMockSQLFileManager(['01_read_users.sql', '02_write_insert.sql']);
        const strategy = new RandomDistributionStrategy(manager as any);

        const file = strategy.selectSQLFile(1, 1, 10);
        expect(file).not.toBeNull();
        expect(file).toBeInstanceOf(SQLFile);
        expect(file!.fileName).toMatch(/\.sql$/);
    });

    it('returns one of the available files', () => {
        const fileNames = ['01_read_users.sql', '02_write_insert.sql', '03_complex_join.sql'];
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new RandomDistributionStrategy(manager as any);

        // Run multiple times to exercise randomness
        for (let i = 0; i < 20; i++) {
            const file = strategy.selectSQLFile(1, i, 20);
            expect(file).not.toBeNull();
            expect(fileNames).toContain(file!.fileName);
        }
    });

    it('returns null when no files are available', () => {
        const manager = createEmptyMockSQLFileManager();
        const strategy = new RandomDistributionStrategy(manager as any);

        const file = strategy.selectSQLFile(1, 1, 10);
        expect(file).toBeNull();
    });

    it('reports correct strategy name', () => {
        const manager = createMockSQLFileManager(['01_test.sql']);
        const strategy = new RandomDistributionStrategy(manager as any);
        expect(strategy.getStrategyName()).toBe('RandomDistributionStrategy');
    });
});

describe('RoundRobinDistributionStrategy', () => {
    const fileNames = ['01_a.sql', '02_b.sql', '03_c.sql'];

    it('distributes evenly across files', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new RoundRobinDistributionStrategy(manager as any);
        const testIterations = 3;

        // Thread 1, iterations 1-3 should cycle through files
        const results: string[] = [];
        for (let iter = 1; iter <= 6; iter++) {
            const file = strategy.selectSQLFile(1, iter, testIterations);
            expect(file).not.toBeNull();
            results.push(file!.fileName);
        }

        // Each file should appear exactly twice in 6 iterations
        for (const name of fileNames) {
            const count = results.filter(r => r === name).length;
            expect(count).toBe(2);
        }
    });

    it('uses threadId and iteration for index calculation', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new RoundRobinDistributionStrategy(manager as any);
        const testIterations = 3;

        // Thread 1, iter 1: index = (1-1)*3 + (1-1) = 0 -> file 0
        const f1 = strategy.selectSQLFile(1, 1, testIterations);
        expect(f1!.fileName).toBe('01_a.sql');

        // Thread 1, iter 2: index = (1-1)*3 + (2-1) = 1 -> file 1
        const f2 = strategy.selectSQLFile(1, 2, testIterations);
        expect(f2!.fileName).toBe('02_b.sql');

        // Thread 2, iter 1: index = (2-1)*3 + (1-1) = 3 % 3 = 0 -> file 0
        const f3 = strategy.selectSQLFile(2, 1, testIterations);
        expect(f3!.fileName).toBe('01_a.sql');
    });

    it('wraps around when index exceeds file count', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new RoundRobinDistributionStrategy(manager as any);

        // Large thread/iteration should still produce valid results
        const file = strategy.selectSQLFile(100, 50, 100);
        expect(file).not.toBeNull();
        expect(fileNames).toContain(file!.fileName);
    });

    it('returns null when no files are available', () => {
        const manager = createEmptyMockSQLFileManager();
        const strategy = new RoundRobinDistributionStrategy(manager as any);
        expect(strategy.selectSQLFile(1, 1, 10)).toBeNull();
    });
});

describe('SequentialDistributionStrategy', () => {
    const fileNames = ['01_a.sql', '02_b.sql', '03_c.sql'];

    it('iterates through files sequentially', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new SequentialDistributionStrategy(manager as any);

        expect(strategy.selectSQLFile(1, 1, 10)!.fileName).toBe('01_a.sql');
        expect(strategy.selectSQLFile(1, 2, 10)!.fileName).toBe('02_b.sql');
        expect(strategy.selectSQLFile(1, 3, 10)!.fileName).toBe('03_c.sql');
    });

    it('wraps around after reaching the end', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new SequentialDistributionStrategy(manager as any);

        // Advance through all 3 files
        strategy.selectSQLFile(1, 1, 10);
        strategy.selectSQLFile(1, 2, 10);
        strategy.selectSQLFile(1, 3, 10);

        // Should wrap back to first file
        expect(strategy.selectSQLFile(1, 4, 10)!.fileName).toBe('01_a.sql');
    });

    it('ignores threadId — uses internal counter only', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new SequentialDistributionStrategy(manager as any);

        // Different threadIds should not reset the counter
        expect(strategy.selectSQLFile(1, 1, 10)!.fileName).toBe('01_a.sql');
        expect(strategy.selectSQLFile(5, 1, 10)!.fileName).toBe('02_b.sql');
        expect(strategy.selectSQLFile(99, 1, 10)!.fileName).toBe('03_c.sql');
    });

    it('returns null when no files are available', () => {
        const manager = createEmptyMockSQLFileManager();
        const strategy = new SequentialDistributionStrategy(manager as any);
        expect(strategy.selectSQLFile(1, 1, 10)).toBeNull();
    });

    it('maintains state across many calls', () => {
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new SequentialDistributionStrategy(manager as any);

        const results: string[] = [];
        for (let i = 0; i < 9; i++) {
            results.push(strategy.selectSQLFile(1, i + 1, 10)!.fileName);
        }

        // Should produce 3 full cycles
        expect(results).toEqual([
            '01_a.sql', '02_b.sql', '03_c.sql',
            '01_a.sql', '02_b.sql', '03_c.sql',
            '01_a.sql', '02_b.sql', '03_c.sql',
        ]);
    });
});

describe('CategoryBasedDistributionStrategy', () => {
    it('selects files matching the category for a given threadId', () => {
        // Categories cycle: read(0), write(1), complex(2), report(3), misc(4)
        // threadId 1 -> categoryIndex 0 -> 'read'
        const fileNames = [
            'read_users.sql',       // category: read
            'write_insert.sql',     // category: write
            'complex_join.sql',     // category: complex
            'report_summary.sql',   // category: report
            '01_test.sql',          // category: misc
        ];
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new CategoryBasedDistributionStrategy(manager as any);

        // Thread 1 -> category 'read' -> should pick read_users.sql
        const file = strategy.selectSQLFile(1, 1, 10);
        expect(file).not.toBeNull();
        expect(file!.category).toBe('read');
    });

    it('falls back to random when no files match the category', () => {
        // Only misc files, but threadId 1 expects 'read'
        const fileNames = ['01_test.sql', '02_other.sql'];
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new CategoryBasedDistributionStrategy(manager as any);

        const file = strategy.selectSQLFile(1, 1, 10);
        expect(file).not.toBeNull();
        // Falls back to random, so it should be one of the available files
        expect(fileNames).toContain(file!.fileName);
    });

    it('cycles through all 5 categories based on threadId', () => {
        const fileNames = [
            'read_users.sql',
            'write_insert.sql',
            'complex_join.sql',
            'report_summary.sql',
            '01_misc.sql',
        ];
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new CategoryBasedDistributionStrategy(manager as any);

        const expectedCategories: SQLFileCategory[] = ['read', 'write', 'complex', 'report', 'misc'];

        for (let threadId = 1; threadId <= 5; threadId++) {
            const file = strategy.selectSQLFile(threadId, 1, 10);
            expect(file).not.toBeNull();
            expect(file!.category).toBe(expectedCategories[threadId - 1]);
        }
    });

    it('wraps categories for threadId > 5', () => {
        const fileNames = ['read_users.sql', 'write_insert.sql'];
        const manager = createMockSQLFileManager(fileNames);
        const strategy = new CategoryBasedDistributionStrategy(manager as any);

        // Thread 6 -> categoryIndex (6-1) % 5 = 0 -> 'read'
        const file = strategy.selectSQLFile(6, 1, 10);
        expect(file).not.toBeNull();
        expect(file!.category).toBe('read');
    });

    it('returns null when no files are available', () => {
        const manager = createEmptyMockSQLFileManager();
        const strategy = new CategoryBasedDistributionStrategy(manager as any);
        expect(strategy.selectSQLFile(1, 1, 10)).toBeNull();
    });
});

describe('StrategyFactory', () => {
    const manager = createMockSQLFileManager(['01_test.sql']);

    describe('createStrategy', () => {
        it('creates RandomDistributionStrategy', () => {
            const strategy = StrategyFactory.createStrategy('Random', manager as any);
            expect(strategy).toBeInstanceOf(RandomDistributionStrategy);
        });

        it('creates RoundRobinDistributionStrategy', () => {
            const strategy = StrategyFactory.createStrategy('RoundRobin', manager as any);
            expect(strategy).toBeInstanceOf(RoundRobinDistributionStrategy);
        });

        it('creates SequentialDistributionStrategy', () => {
            const strategy = StrategyFactory.createStrategy('Sequential', manager as any);
            expect(strategy).toBeInstanceOf(SequentialDistributionStrategy);
        });

        it('creates CategoryBasedDistributionStrategy', () => {
            const strategy = StrategyFactory.createStrategy('CategoryBased', manager as any);
            expect(strategy).toBeInstanceOf(CategoryBasedDistributionStrategy);
        });

        it('throws for unknown strategy name', () => {
            expect(() => StrategyFactory.createStrategy('InvalidStrategy' as any, manager as any))
                .toThrow('Unknown strategy: InvalidStrategy');
        });
    });

    describe('getAvailableStrategies', () => {
        it('returns all 4 strategy names', () => {
            const strategies = StrategyFactory.getAvailableStrategies();
            expect(strategies).toEqual(['Random', 'RoundRobin', 'Sequential', 'CategoryBased']);
        });

        it('returns a new array each time', () => {
            const a = StrategyFactory.getAvailableStrategies();
            const b = StrategyFactory.getAvailableStrategies();
            expect(a).toEqual(b);
            expect(a).not.toBe(b);
        });
    });
});

describe('SQLFile (category extraction)', () => {
    it('categorizes read_ prefix as read', () => {
        const file = createMockSQLFile('read_users.sql');
        expect(file.category).toBe('read');
    });

    it('categorizes _select_ infix as read', () => {
        const file = createMockSQLFile('01_select_all.sql');
        expect(file.category).toBe('read');
    });

    it('categorizes write_ prefix as write', () => {
        const file = createMockSQLFile('write_orders.sql');
        expect(file.category).toBe('write');
    });

    it('categorizes _insert_ infix as write', () => {
        const file = createMockSQLFile('01_insert_batch.sql');
        expect(file.category).toBe('write');
    });

    it('categorizes _update_ infix as write', () => {
        const file = createMockSQLFile('01_update_status.sql');
        expect(file.category).toBe('write');
    });

    it('categorizes complex_ prefix as complex', () => {
        const file = createMockSQLFile('complex_multi_table.sql');
        expect(file.category).toBe('complex');
    });

    it('categorizes _join_ infix as complex', () => {
        const file = createMockSQLFile('01_join_orders.sql');
        expect(file.category).toBe('complex');
    });

    it('categorizes report_ prefix as report', () => {
        const file = createMockSQLFile('report_monthly.sql');
        expect(file.category).toBe('report');
    });

    it('categorizes _aggregate_ infix as report', () => {
        const file = createMockSQLFile('01_aggregate_sales.sql');
        expect(file.category).toBe('report');
    });

    it('defaults to misc for unrecognized patterns', () => {
        const file = createMockSQLFile('01_test.sql');
        expect(file.category).toBe('misc');
    });

    it('extracts order number from prefix', () => {
        const file = createMockSQLFile('05_query.sql');
        expect(file.order).toBe(5);
    });

    it('returns null order when no prefix number', () => {
        const file = createMockSQLFile('read_users.sql');
        expect(file.order).toBeNull();
    });

    it('strips .sql extension for name property', () => {
        const file = createMockSQLFile('01_test.sql');
        expect(file.name).toBe('01_test');
    });

    it('normalizes whitespace in content', () => {
        const file = new SQLFile('test.sql', '/mock/test.sql', '  SELECT  1\n  FROM  dual  ');
        expect(file.content).toBe('SELECT 1 FROM dual');
    });
});
