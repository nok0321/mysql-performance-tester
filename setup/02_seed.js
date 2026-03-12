/**
 * 02_seed.js - 動作確認用ダミーデータ投入スクリプト
 *
 * 実行: node setup/02_seed.js
 * 前提: setup/01_ddl.sql でテーブル作成済み、.env に DB 設定があること
 *
 * 投入件数:
 *   users        : 200件
 *   products     : 50件
 *   orders       : 500件 (各ユーザー約2.5件)
 *   order_items  : 1000〜1500件 (各注文2〜3品)
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'your_username',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_NAME || 'sample_app',
  waitForConnections: true,
  connectionLimit: 5
});

// ─── ユーティリティ ─────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const fmtDt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const randDate = (daysBack) => {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, daysBack));
  d.setHours(rand(0, 23), rand(0, 59), rand(0, 59));
  return fmtDt(d);
};

// 日本語風のサンプルデータ
const FIRST_NAMES = ['田中', '山田', '佐藤', '鈴木', '高橋', '伊藤', '渡辺', '中村', '小林', '加藤',
  '吉田', '山本', '松本', '井上', '木村', '林', '清水', '山口', '森', '池田'];
const LAST_NAMES = ['太郎', '花子', '次郎', '美咲', '健一', '愛', '浩二', '恵', '誠', 'さくら'];
const DOMAINS = ['example.com', 'test.jp', 'demo.org', 'sample.net', 'mock.co.jp'];
const CATEGORIES = ['電子機器', '書籍', '衣類', '食品', '家具', 'スポーツ', '玩具', '美容', 'キッチン', 'アウトドア'];
const PRODUCT_PFXS = ['プレミアム', 'スタンダード', 'エコ', 'プロ', 'ライト', 'デラックス', 'ミニ', 'スーパー'];
const ORDER_STATUS = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const USER_STATUS = ['active', 'active', 'active', 'active', 'inactive', 'banned']; // active が多め

// ─── users INSERT ───────────────────────────────────────────────────────────
async function seedUsers(conn, count = 200) {
  console.log(`  Users (${count}件) を投入中...`);
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const email = `user${i}@${pick(DOMAINS)}`;
    const age = rand(18, 80);
    const status = pick(USER_STATUS);
    const score = (Math.random() * 10000).toFixed(2);
    const createdAt = randDate(730); // 過去2年
    rows.push([name, email, age, status, score, createdAt]);
  }
  // バルクインサート（100件ずつ）
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await conn.query(
      `INSERT INTO users (name, email, age, status, score, created_at) VALUES ${chunk.map(() => '(?,?,?,?,?,?)').join(',')}`,
      chunk.flat()
    );
  }
  console.log(`  ✓ users 完了`);
}

// ─── products INSERT ────────────────────────────────────────────────────────
async function seedProducts(conn, count = 50) {
  console.log(`  Products (${count}件) を投入中...`);
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const cat = pick(CATEGORIES);
    const pfx = pick(PRODUCT_PFXS);
    const name = `${pfx}${cat}商品 No.${i}`;
    const price = (rand(100, 50000)).toFixed(2);
    const stock = rand(0, 500);
    const isActive = Math.random() > 0.1 ? 1 : 0;
    rows.push([name, cat, price, stock, isActive]);
  }
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await conn.query(
      `INSERT INTO products (name, category, price, stock_quantity, is_active) VALUES ${chunk.map(() => '(?,?,?,?,?)').join(',')}`,
      chunk.flat()
    );
  }
  console.log(`  ✓ products 完了`);
}

// ─── orders + order_items INSERT ────────────────────────────────────────────
async function seedOrders(conn, userCount = 200, productCount = 50, orderCount = 500) {
  console.log(`  Orders (${orderCount}件) + order_items を投入中...`);

  let totalItems = 0;
  for (let i = 0; i < orderCount; i++) {
    const userId = rand(1, userCount);
    const status = pick(ORDER_STATUS);
    const createdAt = randDate(365);

    const [result] = await conn.query(
      `INSERT INTO orders (user_id, status, created_at) VALUES (?, ?, ?)`,
      [userId, status, createdAt]
    );
    const orderId = result.insertId;

    // 各注文に 1〜4 品を追加
    const itemCount = rand(1, 4);
    const usedProducts = new Set();
    let total = 0;

    for (let j = 0; j < itemCount; j++) {
      let productId;
      do { productId = rand(1, productCount); }
      while (usedProducts.has(productId));
      usedProducts.add(productId);

      const quantity = rand(1, 5);
      const unitPrice = (rand(100, 30000)).toFixed(2);
      total += quantity * parseFloat(unitPrice);

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
        [orderId, productId, quantity, unitPrice]
      );
      totalItems++;
    }

    // 合計金額を更新
    await conn.query(`UPDATE orders SET total_amount = ? WHERE id = ?`, [total.toFixed(2), orderId]);

    // 進捗表示
    if ((i + 1) % 100 === 0) process.stdout.write(`    ${i + 1}/${orderCount} 件...\r`);
  }
  console.log(`  ✓ orders (${orderCount}件) + order_items (${totalItems}件) 完了`);
}

// ─── メイン ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 ダミーデータ投入開始\n');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // FK チェックを一時無効化してデータ投入を高速化
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    await seedUsers(conn, 200);
    await seedProducts(conn, 50);
    await seedOrders(conn, 200, 50, 500);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();

    // 件数確認
    const [counts] = await conn.query(`
            SELECT
                (SELECT COUNT(*) FROM users)       AS users,
                (SELECT COUNT(*) FROM products)    AS products,
                (SELECT COUNT(*) FROM orders)      AS orders,
                (SELECT COUNT(*) FROM order_items) AS order_items
        `);
    console.log('\n📊 投入結果:');
    console.table(counts[0]);

    console.log('\n✅ ダミーデータ投入完了！\n');
  } catch (err) {
    await conn.rollback();
    console.error('\n❌ エラー:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
