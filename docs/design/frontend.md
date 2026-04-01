# フロントエンド設計

## i18n（国際化）

### 技術スタック

- **react-i18next** — React コンポーネントでの翻訳フック (`useTranslation`)
- **i18next-browser-languagedetector** — ブラウザ言語の自動検出

### リソースファイル

```
web-ui/src/i18n/
├── index.ts                 # i18next 初期化設定
└── locales/
    ├── ja.json              # 日本語（~270キー）
    └── en.json              # 英語（~270キー）
```

### 言語検出と永続化

1. **初回アクセス**: `i18next-browser-languagedetector` がブラウザの `navigator.language` を検出
2. **切替**: Settings ページの言語セレクタで手動切替
3. **永続化**: `localStorage` に保存（キー: `perftest-lang`）
4. **次回アクセス**: `localStorage` の値を優先的に使用

### 翻訳キー構造

```json
{
  "nav": { "connections": "接続管理", "singleTest": "単一テスト", ... },
  "pageMeta": { "title": "...", "description": "..." },
  "connections": { "title": "...", "form": { ... } },
  "singleTest": { ... },
  "parallelTest": { ... },
  "comparison": { ... },
  "reports": { ... },
  "analytics": { ... },
  "history": { ... },
  "settings": { ... },
  "common": { "save": "保存", "cancel": "キャンセル", "delete": "削除", ... },
  "components": { "modal": { ... }, "table": { ... } }
}
```

### 使用例

```tsx
import { useTranslation } from 'react-i18next';

function ConnectionsPage() {
  const { t } = useTranslation();
  return <h1>{t('connections.title')}</h1>;
}
```

---

## アクセシビリティ (a11y)

### 自動チェック

- **eslint-plugin-jsx-a11y** を ESLint に統合
- ビルド時・lint 時にアクセシビリティ違反を自動検出

### 実装パターン

#### Skip-to-content リンク

キーボードナビゲーション時にメインコンテンツへ直接ジャンプできるリンク。フォーカス時のみ表示。

```tsx
<a href="#main-content" className="skip-link">
  Skip to content
</a>
```

#### ナビゲーション

```tsx
<nav aria-label="Main navigation">
  {/* ナビゲーションリンク */}
</nav>
<main id="main-content" role="main">
  {/* メインコンテンツ */}
</main>
```

#### モーダル

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">接続を追加</h2>
  {/* モーダルコンテンツ */}
</div>
```

#### フォーム

```tsx
<label htmlFor="host-input">ホスト</label>
<input id="host-input" aria-required="true" />
```

#### テーブル

```tsx
<table>
  <thead>
    <tr>
      <th scope="col">クエリ名</th>
      <th scope="col">実行時間</th>
    </tr>
  </thead>
  {/* ... */}
</table>
```

#### アイコンボタン

```tsx
<button aria-label="接続を削除">
  <TrashIcon />
</button>
```

#### Focus スタイル

`:focus-visible` を使用して、キーボードナビゲーション時のみフォーカスアウトラインを表示。マウスクリック時には表示しない。

```css
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
```
