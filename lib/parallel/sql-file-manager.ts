/**
 * SQL file management class
 * Manages SQL files for parallel execution
 */

import fs from 'fs/promises';
import path from 'path';

/** Category of a SQL file based on its filename */
export type SQLFileCategory = 'read' | 'write' | 'complex' | 'report' | 'misc';

/**
 * SQL file data class
 */
export class SQLFile {
    public readonly fileName: string;
    public readonly name: string;
    public readonly filePath: string;
    public readonly content: string;
    public readonly category: SQLFileCategory;
    public readonly order: number | null;

    constructor(fileName: string, filePath: string, content: string) {
        this.fileName = fileName;
        this.name = fileName.replace('.sql', '');
        this.filePath = filePath;
        this.content = this.normalizeContent(content);
        this.category = this.extractCategory(fileName);
        this.order = this.extractOrder(fileName);
    }

    /**
     * Normalize content by collapsing whitespace
     */
    private normalizeContent(content: string): string {
        return content.trim()
            .replace(/\r\n/g, ' ')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Extract category from filename
     */
    private extractCategory(fileName: string): SQLFileCategory {
        if (fileName.startsWith('read_') || fileName.includes('_select_')) return 'read';
        if (fileName.startsWith('write_') || fileName.includes('_insert_') || fileName.includes('_update_')) return 'write';
        if (fileName.startsWith('complex_') || fileName.includes('_join_')) return 'complex';
        if (fileName.startsWith('report_') || fileName.includes('_aggregate_')) return 'report';
        return 'misc';
    }

    /**
     * Extract ordering number from filename
     */
    private extractOrder(fileName: string): number | null {
        const match = fileName.match(/^(\d+)_/);
        return match ? parseInt(match[1]) : null;
    }
}

/**
 * SQL file manager class
 */
export class SQLFileManager {
    private readonly parallelSQLDir: string;
    private sqlFilePool: SQLFile[];

    constructor(parallelSQLDir: string) {
        this.parallelSQLDir = parallelSQLDir;
        this.sqlFilePool = [];
    }

    /**
     * Load SQL files from the parallel directory
     */
    async loadSQLFiles(): Promise<boolean> {
        console.log('\n=== 並列実行用SQLファイル読み込み ===');

        try {
            await fs.access(this.parallelSQLDir);
            const files = await fs.readdir(this.parallelSQLDir);
            const sqlFiles = files.filter(file => file.endsWith('.sql'));

            console.log(`📁 ディレクトリ: ${this.parallelSQLDir}`);
            console.log(`📄 発見したSQLファイル: ${sqlFiles.length}件`);

            for (const file of sqlFiles) {
                const filePath = path.join(this.parallelSQLDir, file);
                const content = await fs.readFile(filePath, 'utf8');

                const sqlFile = new SQLFile(file, filePath, content);
                this.sqlFilePool.push(sqlFile);
            }

            this.sortSQLFiles();
            this.logLoadedFiles();

            return this.sqlFilePool.length > 0;

        } catch (error) {
            console.error(`SQL file read error: ${(error as Error).message}`);
            console.error(`Directory: ${this.parallelSQLDir}`);
            return false;
        }
    }

    /**
     * Sort SQL files by order number then filename
     */
    private sortSQLFiles(): void {
        this.sqlFilePool.sort((a, b) => {
            if (a.order !== null && b.order !== null) {
                return a.order - b.order;
            }
            return a.fileName.localeCompare(b.fileName);
        });
    }

    /**
     * Log loaded files to console
     */
    private logLoadedFiles(): void {
        console.log('読み込み完了:');
        this.sqlFilePool.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file.fileName} (${file.category})`);
        });
    }

    /**
     * Get all loaded SQL files
     */
    getSQLFiles(): SQLFile[] {
        return this.sqlFilePool;
    }

    /**
     * Get the number of loaded files
     */
    getFileCount(): number {
        return this.sqlFilePool.length;
    }

    /**
     * Get a SQL file by index
     */
    getSQLFile(index: number): SQLFile {
        return this.sqlFilePool[index];
    }

    /**
     * Get a random SQL file
     */
    getRandomSQLFile(): SQLFile | null {
        if (this.sqlFilePool.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * this.sqlFilePool.length);
        return this.sqlFilePool[randomIndex];
    }
}
