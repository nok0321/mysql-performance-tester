/**
 * validate-id.js - ルートパラメータ ID の共通バリデーション
 *
 * IDのパターン:
 *   connections: conn_<timestamp>
 *   sql:         sql_<timestamp>
 *   test results: test_<timestamp>_<random> | parallel_<timestamp>_<random>
 *   batch results: <timestamp> (数字のみ)
 *
 * 許可文字: 英数字・アンダースコア・ハイフン のみ
 * 最大長: 200 文字
 */

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const MAX_ID_LENGTH   = 200;

/**
 * ID をバリデートして安全な値を返す。
 * 不正な場合は例外をスローする。
 *
 * @param {string} id
 * @param {string} [label='ID'] - エラーメッセージ用のラベル
 * @returns {string} 検証済みの ID
 * @throws {Error}
 */
export function validateId(id, label = 'ID') {
  if (!id || typeof id !== 'string') {
    throw Object.assign(new Error(`${label}が指定されていません`), { status: 400 });
  }
  if (id.length > MAX_ID_LENGTH) {
    throw Object.assign(new Error(`${label}が長すぎます`), { status: 400 });
  }
  if (!SAFE_ID_PATTERN.test(id)) {
    throw Object.assign(new Error(`不正な${label}です`), { status: 400 });
  }
  return id;
}

/**
 * validateId のエラーを Express レスポンスに変換するヘルパー。
 *
 * @param {Error} err
 * @param {import('express').Response} res
 */
export function handleIdError(err, res) {
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message });
}
