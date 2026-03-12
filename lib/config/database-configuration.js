/**
 * DB接続設定ファクトリ
 *
 * createDbConfig() がプライマリ API。
 * DatabaseConfiguration クラスは後方互換性のための薄いラッパー（非推奨）。
 */

/**
 * DB接続設定プレーンオブジェクトを生成
 * @param {Object} options
 * @returns {Object} dbConfig
 */
export function createDbConfig(options = {}) {
  return {
    host:           options.host     || process.env.DB_HOST               || 'localhost',
    port:           Number(options.port) || parseInt(process.env.DB_PORT) || 3306,
    user:           options.user     || process.env.DB_USER               || 'root',
    password:       options.password ?? process.env.DB_PASSWORD           ?? '',
    database:       options.database || process.env.DB_NAME               || 'database',
    connectTimeout: options.connectTimeout || 10000,
    acquireTimeout: options.acquireTimeout || 30000,
    timeout:        options.timeout        || 30000,
    parallelThreads: options.parallelThreads || 5,
  };
}

/**
 * mysql2 createPool() に渡す設定オブジェクトを生成
 * @param {Object} dbConfig - createDbConfig() が返すプレーンオブジェクト
 * @returns {Object} mysql2 pool config
 */
export function buildPoolConfig(dbConfig) {
  const connLimit = Math.max(10, dbConfig.parallelThreads + 5);
  return {
    host:     dbConfig.host,
    port:     dbConfig.port,
    user:     dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,

    waitForConnections: true,
    connectionLimit:    connLimit,
    queueLimit:         0,

    maxIdle:     Math.ceil(connLimit / 2),
    idleTimeout: 60000,

    enableKeepAlive:      true,
    keepAliveInitialDelay: 0,

    connectTimeout: dbConfig.connectTimeout,
    acquireTimeout: dbConfig.acquireTimeout,

    multipleStatements: false,
  };
}

export default createDbConfig;
