-- 並列テスト用: ユーザー ID 検索（インデックス使用）
-- 毎回異なる ID 範囲で検索することを想定
SELECT
    u.id,
    u.name,
    u.email,
    u.age,
    u.status,
    u.score,
    u.created_at
FROM users u
WHERE u.id BETWEEN 1 AND 100
  AND u.status = 'active'
ORDER BY u.id;
