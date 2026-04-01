import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            include: ['lib/**/*.ts', 'web/store/**/*.ts'],
            exclude: ['lib/**/index.ts'],
            reporter: ['text', 'text-summary'],
            thresholds: {
                statements: 60,
            },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['tests/**/*.test.{js,ts}'],
                    exclude: ['tests/integration/**'],
                    globals: false,
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration',
                    include: ['tests/integration/**/*.integration.test.ts'],
                    globals: false,
                    testTimeout: 30_000,
                    hookTimeout: 60_000,
                    fileParallelism: false,
                },
            },
        ],
    },
});
