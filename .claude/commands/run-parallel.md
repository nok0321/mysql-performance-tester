---
description: Run parallel SQL load tests from the parallel/ directory
---

# Run Parallel Load Test

`parallel/` ディレクトリ内の SQL ファイルを並列実行して負荷テスト・QPS/TPS 計測を行います。

## Steps

1. `parallel/` ディレクトリに `.sql` ファイルが存在するか確認する
2. `npm run test:parallel` を実行する
3. `performance_results/` の最新レポートを確認し、QPS・P95・P99 を要約する
4. 戦略（Random/RoundRobin/Sequential/CategoryBased）ごとの差異があれば指摘する

詳細オプションは `docs/cli.md` の `parallel` コマンドセクションを参照してください。
