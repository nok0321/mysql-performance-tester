import { describe, it, expect } from 'vitest';
import { parseArguments, generateHelpMessage, getVersion, CLI_OPTIONS } from '../../cli/options.js';

// Helper: prepend dummy node/script args (parseArguments starts at index 2)
const parse = (...args: string[]) => parseArguments(['node', 'script', ...args]);

describe('parseArguments', () => {
    describe('command parsing', () => {
        it('parses "run" command', () => {
            const result = parse('run');
            expect(result.command).toBe('run');
        });

        it('parses "parallel" command', () => {
            const result = parse('parallel');
            expect(result.command).toBe('parallel');
        });

        it('parses "demo" command', () => {
            const result = parse('demo');
            expect(result.command).toBe('demo');
        });

        it('parses "analyze" command', () => {
            const result = parse('analyze');
            expect(result.command).toBe('analyze');
        });

        it('returns null command when none specified', () => {
            const result = parse();
            expect(result.command).toBeNull();
        });

        it('stores extra positional args', () => {
            const result = parse('run', 'extra1', 'extra2');
            expect(result.command).toBe('run');
            expect(result.positional).toEqual(['extra1', 'extra2']);
        });
    });

    describe('default values', () => {
        it('sets default iterations to 20', () => {
            const result = parse();
            expect(result.options.iterations).toBe(20);
        });

        it('sets default threads to 10', () => {
            const result = parse();
            expect(result.options.threads).toBe(10);
        });

        it('sets default warmup to true', () => {
            const result = parse();
            expect(result.options.warmup).toBe(true);
        });

        it('sets default outlierMethod to iqr', () => {
            const result = parse();
            expect(result.options.outlierMethod).toBe('iqr');
        });

        it('sets default sqlDir to ./sql', () => {
            const result = parse();
            expect(result.options.sqlDir).toBe('./sql');
        });

        it('sets default parallelDir to ./parallel', () => {
            const result = parse();
            expect(result.options.parallelDir).toBe('./parallel');
        });
    });

    describe('long options', () => {
        it('parses --iterations with value', () => {
            const result = parse('run', '--iterations', '50');
            expect(result.options.iterations).toBe(50);
        });

        it('parses --threads with value', () => {
            const result = parse('run', '--threads', '20');
            expect(result.options.threads).toBe(20);
        });

        it('parses --outlierMethod with value', () => {
            const result = parse('run', '--outlierMethod', 'zscore');
            expect(result.options.outlierMethod).toBe('zscore');
        });

        it('parses --verbose as boolean flag', () => {
            const result = parse('run', '--verbose');
            expect(result.options.verbose).toBe(true);
        });

        it('parses --help flag', () => {
            const result = parse('--help');
            expect(result.options.help).toBe(true);
        });

        it('parses --version flag', () => {
            const result = parse('--version');
            expect(result.options.version).toBe(true);
        });

        it('parses --sqlDir with value', () => {
            const result = parse('run', '--sqlDir', './custom-sql');
            expect(result.options.sqlDir).toBe('./custom-sql');
        });
    });

    describe('short options', () => {
        it('parses -i for iterations', () => {
            const result = parse('run', '-i', '100');
            expect(result.options.iterations).toBe(100);
        });

        it('parses -t for threads', () => {
            const result = parse('run', '-t', '5');
            expect(result.options.threads).toBe(5);
        });

        it('parses -h for help', () => {
            const result = parse('-h');
            expect(result.options.help).toBe(true);
        });

        it('parses -V for version', () => {
            const result = parse('-V');
            expect(result.options.version).toBe(true);
        });

        it('parses -v for verbose', () => {
            const result = parse('run', '-v');
            expect(result.options.verbose).toBe(true);
        });

        it('parses -s for sqlDir', () => {
            const result = parse('run', '-s', './my-queries');
            expect(result.options.sqlDir).toBe('./my-queries');
        });
    });

    describe('combined options', () => {
        it('parses command with multiple options', () => {
            const result = parse('run', '-i', '50', '-t', '20', '--verbose', '--outlierMethod', 'mad');
            expect(result.command).toBe('run');
            expect(result.options.iterations).toBe(50);
            expect(result.options.threads).toBe(20);
            expect(result.options.verbose).toBe(true);
            expect(result.options.outlierMethod).toBe('mad');
        });
    });

    describe('unknown options', () => {
        it('ignores unknown long options', () => {
            const result = parse('run', '--unknown', 'value');
            expect(result.command).toBe('run');
        });

        it('ignores unknown short options', () => {
            const result = parse('run', '-x');
            expect(result.command).toBe('run');
        });
    });
});

describe('generateHelpMessage', () => {
    it('returns a non-empty string', () => {
        const help = generateHelpMessage();
        expect(help.length).toBeGreaterThan(0);
    });

    it('contains command descriptions', () => {
        const help = generateHelpMessage();
        expect(help).toContain('run');
        expect(help).toContain('parallel');
        expect(help).toContain('demo');
        expect(help).toContain('analyze');
    });

    it('contains option descriptions', () => {
        const help = generateHelpMessage();
        expect(help).toContain('--iterations');
        expect(help).toContain('--threads');
        expect(help).toContain('--help');
    });

    it('contains examples', () => {
        const help = generateHelpMessage();
        expect(help).toContain('mysql-perf-test run');
    });
});

describe('getVersion', () => {
    it('returns a valid semver-like version', () => {
        const version = getVersion();
        expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe('CLI_OPTIONS', () => {
    it('defines iterations with number type', () => {
        expect(CLI_OPTIONS.iterations.type).toBe('number');
    });

    it('defines outlierMethod with choices', () => {
        expect(CLI_OPTIONS.outlierMethod.choices).toEqual(['iqr', 'zscore', 'mad']);
    });

    it('defines all expected options', () => {
        const expectedKeys = [
            'host', 'port', 'user', 'password', 'database',
            'iterations', 'threads', 'sqlDir', 'parallelDir',
            'warmup', 'warmupPercentage', 'removeOutliers', 'outlierMethod',
            'explainAnalyze', 'performanceSchema', 'optimizerTrace', 'bufferPoolMonitoring',
            'generateReport', 'outputDir', 'skipParallel', 'verbose', 'help', 'version'
        ];
        for (const key of expectedKeys) {
            expect(CLI_OPTIONS).toHaveProperty(key);
        }
    });
});
