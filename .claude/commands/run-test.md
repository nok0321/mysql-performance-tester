---
description: Run sequential SQL performance tests from the sql/ directory
---

# Run Sequential Performance Test

`sql/` ディレクトリ内の SQL ファイルを順次実行してパフォーマンスを計測します。

## Steps

1. `sql/` ディレクトリに `.sql` ファイルが存在するか確認する
2. `npm start` を実行してテストを開始する
3. `performance_results/` に出力されたレポートファイルを確認して結果をサマリーする

結果の見方が不明な場合は `docs/interpreting-results.md` を参照してください。
