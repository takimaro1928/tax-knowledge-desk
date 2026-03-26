# Knowledge App

税理士事務所向けのナレッジ管理アプリです。  
ノートを自由に書き込むだけでカテゴリを自動判定し、カテゴリ別一覧や横断検索からすばやく見返せます。

## 主な機能

- ホーム
  - 大きめの本文入力欄にノートを書く
  - タイトルは本文先頭から自動生成
  - 本文からカテゴリを自動判定し、必要に応じて手動変更
- カテゴリタブ
  - 法人税 / 所得税 / 消費税 / 社会保険・労務 / 電帳法・インボイス / 業務手順 / その他
  - 各カテゴリのナレッジを新しい順で一覧表示
- 検索タブ
  - キーワードで全カテゴリを横断検索
- AI提案の承認フロー
  - `is_pending = true` のレコードを承認待ちとして表示
  - 承認で公開、却下で削除
- Supabase対応
  - `knowledge` テーブルへ REST API 経由で接続
  - メールアドレスとパスワードでログイン後にデータへアクセス
  - 未設定時はモックデータで画面確認可能

## 技術構成

- フロント: HTML / CSS / Vanilla JavaScript
- データベース: Supabase
- 通信: Supabase REST API
- 配色: ベージュ・ブラウン系のアースカラー

## ローカル起動

```bash
./start-knowledge-app.sh
```

[http://localhost:4173](http://localhost:4173) を開いて確認します。

## Netlifyデプロイ

ドラッグアンドドロップで公開するのが一番簡単です。

```bash
./scripts/prepare_netlify_release.sh
```

実行後にできる `dist` フォルダを Netlify へそのままドラッグアンドドロップしてください。
ビルド設定は不要です。

## Supabase設定

### 1. テーブル作成

[supabase/schema.sql](/Users/tatsuchan/Documents/New project/knowledge-app/supabase/schema.sql) を Supabase SQL Editor で実行してください。

### 2. 接続情報の入力

以下のいずれかで設定できます。

1. アプリ右上の `接続設定` から `Supabase URL` と `Anon Key` を保存
2. [config.local.example.js](/Users/tatsuchan/Documents/New project/knowledge-app/config.local.example.js) を参考に `config.local.js` を作成

初期状態は `モックデータで確認する` が有効です。

### 3. ログイン

Supabase ダッシュボードで作成したユーザーのメールアドレスとパスワードでログインします。  
ログイン状態はブラウザの `localStorage` に保持されるため、リロード後も継続されます。

## テーブル構成

- `knowledge`
  - `id`
  - `title`
  - `body`
  - `category`
  - `source`
  - `is_pending`
  - `created_at`
  - `updated_at`

## 補足

- カテゴリは以下の初期値を画面で提供しています
  - 法人税
  - 所得税
  - 消費税
  - 社会保険・労務
  - 電帳法・インボイス
  - 業務手順
  - その他
- `category` は `text` 型なので、今後カテゴリを増やしてもスキーマ変更は不要です
- サンプルのモックデータには、承認待ちの AI 提案が含まれています
- 本番利用では `anon` の全面開放は使わず、`authenticated` 向けの RLS ポリシーで運用してください
