/**
 * Shared SQL queries used across integration tests
 */

export const TEST_QUERIES = {
    simpleSelect: "SELECT * FROM users WHERE status = 'active' LIMIT 10",
    countQuery: 'SELECT COUNT(*) AS cnt FROM users',
    joinQuery: `
        SELECT o.id, u.name, o.total_amount
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LIMIT 10
    `.trim(),
    aggregateQuery: 'SELECT category, AVG(price) AS avg_price FROM products GROUP BY category',
    subQuery: `
        SELECT u.name, u.email
        FROM users u
        WHERE u.id IN (SELECT DISTINCT user_id FROM orders WHERE status = 'paid')
    `.trim(),
    invalidQuery: 'SELECT * FROM nonexistent_table_xyz',
};
