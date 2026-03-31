-- 並列テスト用: 最新注文一覧
SELECT
    o.id        AS order_id,
    u.name      AS user_name,
    o.status,
    o.total_amount,
    o.created_at,
    COUNT(oi.id) AS item_count
FROM orders o
INNER JOIN users       u  ON u.id = o.user_id
INNER JOIN order_items oi ON oi.order_id = o.id
WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)
GROUP BY o.id, u.name, o.status, o.total_amount, o.created_at
ORDER BY o.created_at DESC
LIMIT 50;
