/**
 * Distribution strategy classes
 * Defines SQL file distribution strategies for parallel execution
 */

import type { SQLFile, SQLFileManager } from './sql-file-manager.js';

/**
 * Base class for distribution strategies
 */
export class DistributionStrategy {
    protected sqlFileManager: SQLFileManager;

    constructor(sqlFileManager: SQLFileManager) {
        this.sqlFileManager = sqlFileManager;
    }

    /**
     * Select a SQL file (must be implemented by subclasses)
     */
    selectSQLFile(_threadId: number, _iteration: number, _testIterations: number): SQLFile | null {
        throw new Error('selectSQLFile method must be implemented');
    }

    /**
     * Get the strategy name
     */
    getStrategyName(): string {
        return this.constructor.name;
    }
}

/**
 * Random distribution strategy
 */
export class RandomDistributionStrategy extends DistributionStrategy {
    selectSQLFile(_threadId: number, _iteration: number, _testIterations: number): SQLFile | null {
        return this.sqlFileManager.getRandomSQLFile();
    }
}

/**
 * Round-robin distribution strategy
 */
export class RoundRobinDistributionStrategy extends DistributionStrategy {
    selectSQLFile(threadId: number, iteration: number, testIterations: number): SQLFile | null {
        const fileCount = this.sqlFileManager.getFileCount();
        if (fileCount === 0) return null;

        const index = ((threadId - 1) * testIterations + (iteration - 1)) % fileCount;
        return this.sqlFileManager.getSQLFile(index);
    }
}

/**
 * Sequential distribution strategy
 */
export class SequentialDistributionStrategy extends DistributionStrategy {
    private currentIndex: number;

    constructor(sqlFileManager: SQLFileManager) {
        super(sqlFileManager);
        this.currentIndex = 0;
    }

    selectSQLFile(_threadId: number, _iteration: number, _testIterations: number): SQLFile | null {
        const fileCount = this.sqlFileManager.getFileCount();
        if (fileCount === 0) return null;

        const file = this.sqlFileManager.getSQLFile(this.currentIndex % fileCount);
        this.currentIndex++;
        return file;
    }
}

/**
 * Category-based distribution strategy
 */
export class CategoryBasedDistributionStrategy extends DistributionStrategy {
    selectSQLFile(threadId: number, _iteration: number, _testIterations: number): SQLFile | null {
        const files = this.sqlFileManager.getSQLFiles();
        if (files.length === 0) return null;

        // Group by category
        const categories = ['read', 'write', 'complex', 'report', 'misc'] as const;
        const categoryIndex = (threadId - 1) % categories.length;
        const category = categories[categoryIndex];

        const categoryFiles = files.filter(f => f.category === category);
        if (categoryFiles.length === 0) {
            return this.sqlFileManager.getRandomSQLFile();
        }

        const randomIndex = Math.floor(Math.random() * categoryFiles.length);
        return categoryFiles[randomIndex];
    }
}

/** Valid strategy names */
export type StrategyName = 'Random' | 'RoundRobin' | 'Sequential' | 'CategoryBased';

/** Map of strategy name to constructor */
type StrategyConstructor = new (sqlFileManager: SQLFileManager) => DistributionStrategy;

/**
 * Strategy factory
 */
export class StrategyFactory {
    /**
     * Create a strategy instance from a strategy name
     */
    static createStrategy(strategyName: StrategyName, sqlFileManager: SQLFileManager): DistributionStrategy {
        const strategies: Record<StrategyName, StrategyConstructor> = {
            'Random': RandomDistributionStrategy,
            'RoundRobin': RoundRobinDistributionStrategy,
            'Sequential': SequentialDistributionStrategy,
            'CategoryBased': CategoryBasedDistributionStrategy
        };

        const StrategyClass = strategies[strategyName];
        if (!StrategyClass) {
            throw new Error(`Unknown strategy: ${strategyName}`);
        }

        return new StrategyClass(sqlFileManager);
    }

    /**
     * Get the list of available strategy names
     */
    static getAvailableStrategies(): StrategyName[] {
        return ['Random', 'RoundRobin', 'Sequential', 'CategoryBased'];
    }
}
