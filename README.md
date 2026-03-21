# Tax Knowledge Desk

税理士事務所向けのナレッジ管理アプリです。  
調べた論点、業務手順、Agent 17 からの保存提案をまとめて蓄積し、カテゴリやキーワードで検索できます。

## 主な機能

- ナレッジの登録
  - タイトル、本文、画像URLを保存
  - 画像ファイルを読み込んで `data:` URL として保存可能
  - 本文からカテゴリを自動判定し、必要に応じて手動変更
- ナレッジの検索・閲覧
  - キーワード検索
  - カテゴリ絞り込み
  - 登録日順 / 更新日順の並び替え
- AI提案の承認フロー
  - `is_pending = true` のレコードを承認待ちとして表示
  - 承認で公開、却下で削除
- Supabase対応
  - `knowledge` テーブルへ REST API 経由で接続
  - 未設定時はモックデータで画面確認可能

## 技術構成

- フロント: HTML / CSS / Vanilla JavaScript
- データベース: Supabase
- 通信: Supabase REST API
- 配色: ベージュ・ブラウン系のアースカラー

## ローカル起動

```bash
python3 -m http.server 4173
```

[http://localhost:4173](http://localhost:4173) を開いて確認します。

## Supabase設定

### 1. テーブル作成

[supabase/schema.sql](/Users/tatsuchan/Documents/New project/tax-knowledge-desk/supabase/schema.sql) を Supabase SQL Editor で実行してください。

### 2. 接続情報の入力

以下のいずれかで設定できます。

1. アプリ右上の `接続設定` から `Supabase URL` と `Anon Key` を保存
2. [config.local.example.js](/Users/tatsuchan/Documents/New project/tax-knowledge-desk/config.local.example.js) を参考に `config.local.js` を作成

初期状態は `モックデータで確認する` が有効です。

## テーブル構成

- `knowledge`
  - `id`
  - `title`
  - `body`
  - `image_url`
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
- 現在の `schema.sql` は `anon` でもアクセスできる設定です。公開運用時は認証や RLS の見直しを推奨します
