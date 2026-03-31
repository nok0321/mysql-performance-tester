import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
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
