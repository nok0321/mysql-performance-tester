-- 並列テスト用: 商品検索（カテゴリフィルタ）
SELECT
    p.id,
    p.name,
    p.category,
    p.price,
    p.stock_quantity,
    COUNT(oi.id)              AS times_ordered,
    SUM(oi.quantity)          AS total_sold
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
WHERE p.is_active = 1
  AND p.price BETWEEN 1000 AND 20000
GROUP BY p.id, p.name, p.category, p.price, p.stock_quantity
ORDER BY total_sold DESC
LIMIT 20;
