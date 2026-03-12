---
description: Review and summarize the latest performance test results
---

# Check Performance Results

`performance_results/` ディレクトリ内の最新レポートを確認してサマリーを提示します。

## Steps

1. `performance_results/` 内のファイルを更新日時順に一覧表示する
2. 最新の JSON レポートを読み取る
3. 以下の観点でサマリーを作成する:
   - テスト対象クエリ名と実行回数
   - P50 / P95 / P99 レイテンシ（ms）
   - 最速・最遅クエリ
   - 外れ値の有無
   - ウォームアップ前後の差（存在する場合）
4. 問題のある結果（P99 > 1000ms など）があれば警告として強調する

結果の評価基準は `docs/interpreting-results.md` を参照してください。
