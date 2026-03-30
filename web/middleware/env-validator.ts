/**
 * Environment variable validation at startup
 *
 * Validates required and recommended environment variables
 * before the server begins accepting requests.
 */

const MIN_KEY_LENGTH = 32;

/**
 * Validate environment variables. Exits process on failure.
 */
export function validateEnv(): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ─── Required ─────────────────────────────────────────────────────────
    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey) {
        errors.push(
            'ENCRYPTION_KEY が設定されていません。',
            '  .env ファイルに以下を追加してください:',
            '  ENCRYPTION_KEY=<32文字以上のランダム文字列>',
            '  生成例: openssl rand -base64 32',
        );
    } else if (encKey.length < MIN_KEY_LENGTH) {
        errors.push(
            `ENCRYPTION_KEY が短すぎます（現在 ${encKey.length} 文字、最低 ${MIN_KEY_LENGTH} 文字必要）。`,
            '  openssl rand -base64 32 などで生成した強いキーを使用してください。',
        );
    }

    // ─── Recommended ──────────────────────────────────────────────────────
    if (!process.env.DB_HOST) {
        warnings.push('DB_HOST が未設定です（デフォルト: localhost）');
    }
    if (!process.env.DB_USER) {
        warnings.push('DB_USER が未設定です（デフォルト: root）');
    }
    if (!process.env.DB_NAME && !process.env.DB_DATABASE) {
        warnings.push('DB_NAME / DB_DATABASE が未設定です');
    }

    // ─── Output ───────────────────────────────────────────────────────────
    if (warnings.length > 0) {
        console.warn('[Env] 推奨環境変数が未設定です:');
        warnings.forEach(w => console.warn(`  ⚠ ${w}`));
    }

    if (errors.length > 0) {
        console.error('[Security] 起動前チェックに失敗しました:');
        errors.forEach(e => console.error(`  ${e}`));
        process.exit(1);
    }
}
