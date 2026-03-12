-- ============================================================
-- MySQL Performance Tester - 動作確認用 DDL
-- 実行: mysql -u root -p < setup/01_ddl.sql
-- ============================================================

-- ─── データベース ────────────────────────────────────────────
-- 別のデータベースを使用する場合は以下2行をコメントアウトし、
-- USE <your_database>; に差し替えてください。
DROP DATABASE IF EXISTS perf_test;
CREATE DATABASE perf_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE perf_test;

-- ─── 既存テーブルの削除（再実行時のクリーンアップ）──────────
-- DROP DATABASE を使用する場合は以下4行は不要ですが、
-- 既存DBを流用する際はこちらを有効にしてください。
-- DROP TABLE IF EXISTS order_items;
-- DROP TABLE IF EXISTS orders;
-- DROP TABLE IF EXISTS products;
-- DROP TABLE IF EXISTS users;

-- ─── ユーザーテーブル ───────────────────────────────────────
CREATE TABLE users (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name         VARCHAR(100)    NOT NULL,
    email        VARCHAR(255)    NOT NULL,
    age          TINYINT UNSIGNED NOT NULL,
    status       ENUM('active','inactive','banned') NOT NULL DEFAULT 'active',
    score        DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    profile_text TEXT,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_email (email),
    KEY idx_status  (status),
    KEY idx_created (created_at),
    KEY idx_score   (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 商品テーブル ───────────────────────────────────────────
CREATE TABLE products (
    id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name           VARCHAR(200)    NOT NULL,
    category       VARCHAR(50)     NOT NULL,
    price          DECIMAL(10,2)   NOT NULL,
    stock_quantity INT UNSIGNED    NOT NULL DEFAULT 0,
    is_active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_category (category),
    KEY idx_price    (price),
    KEY idx_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 注文テーブル ───────────────────────────────────────────
CREATE TABLE orders (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id      INT UNSIGNED    NOT NULL,
    status       ENUM('pending','paid','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_id   (user_id),
    KEY idx_status    (status),
    KEY idx_created   (created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 注文明細テーブル ───────────────────────────────────────
CREATE TABLE order_items (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    order_id    INT UNSIGNED    NOT NULL,
    product_id  INT UNSIGNED    NOT NULL,
    quantity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    unit_price  DECIMAL(10,2)   NOT NULL,
    PRIMARY KEY (id),
    KEY idx_order_id   (order_id),
    KEY idx_product_id (product_id),
    CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders   (id),
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
