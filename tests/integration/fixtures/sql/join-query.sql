SELECT o.id, u.name, o.total_amount FROM orders o JOIN users u ON o.user_id = u.id LIMIT 5
